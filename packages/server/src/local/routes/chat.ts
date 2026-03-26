import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { runAgentLoop, needsConfirmation, CapabilityRouter, analyzeAndRecordCorrection, recordCapabilityGap, assessTrust, formatTrustSummary, scanForInjection, AGENT_LOOP_REROUTE_PREFIX, extractEntities } from '@waggle/agent';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt } from './workspace-context.js';
import { formatWorkspaceStatePrompt } from '../workspace-state.js';
import { emitNotification } from './notifications.js';
import { emitAuditEvent } from './events.js';
import { validateOrigin } from '../cors-config.js';
import { getPersona, composePersonaPrompt } from '@waggle/agent';
import { TeamSync, WaggleConfig } from '@waggle/core';

// ── Ambiguity Detection (GAP-006) ──────────────────────────────────────

/** Action verbs that indicate clear user intent (case-insensitive start of message) */
const ACTION_VERBS = [
  'search', 'find', 'create', 'write', 'read', 'edit', 'delete',
  'show', 'list', 'run', 'execute', 'generate', 'draft', 'plan',
  'research', 'review', 'analyze', 'help',
];
const ACTION_VERB_PATTERN = new RegExp(`^(${ACTION_VERBS.join('|')})\\b`, 'i');

/**
 * Detect whether a user message is too brief/vague to act on confidently.
 * Returns true when the message is short and lacks clear intent signals.
 *
 * Exported for testing.
 */
export function isAmbiguousMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Must have fewer than 10 words
  const words = trimmed.split(/\s+/);
  if (words.length >= 10) return false;

  // Slash commands are never ambiguous
  if (trimmed.startsWith('/')) return false;

  // Questions are never ambiguous
  if (trimmed.includes('?')) return false;

  // File path patterns (contains "/" or "\" or ".ext")
  if (/[/\\]/.test(trimmed) || /\.\w{1,5}$/.test(trimmed) || /\.\w{1,5}\s/.test(trimmed)) return false;

  // URLs
  if (/https?:\/\//.test(trimmed) || /www\./.test(trimmed)) return false;

  // Starts with a common action verb
  if (ACTION_VERB_PATTERN.test(trimmed)) return false;

  return true;
}

// ── Contextual Cron Suggestion (IMP-004) ──────────────────────────────

/** Patterns indicating the user or agent discussed recurring/scheduled work */
const RECURRING_PATTERNS = /\b(every\s+day|daily|weekly|every\s+week|each\s+morning|every\s+morning|regularly|recurring|scheduled?|every\s+month|monthly)\b/i;

/**
 * Check whether the agent response should get a scheduling suggestion appended.
 * Returns true when the response mentions recurring work AND no cron/schedule
 * tool was already invoked this turn.
 *
 * Exported for testing.
 */
export function shouldSuggestSchedule(responseText: string, toolsUsed: string[]): boolean {
  if (!responseText) return false;
  if (toolsUsed.some(t => t.includes('schedule') || t.includes('cron'))) return false;
  return RECURRING_PATTERNS.test(responseText);
}

const SCHEDULE_SUGGESTION = '\n\n💡 *Want this to run automatically? Use /schedule or ask me to set up a recurring task.*';

/** System prompt prefix injected for ambiguous messages */
const AMBIGUITY_PROMPT = `IMPORTANT: The user's message is very brief and may be vague. Ask ONE specific clarifying question before taking any action. Do not generate documents, run tools, or take action without first understanding what the user wants. Start your response with a question.\n\n`;

/**
 * Persist a chat message to the session's .jsonl file on disk.
 * This ensures messages survive server restarts.
 */
function persistMessage(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
  msg: { role: string; content: string },
) {
  const sessionsDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);

  // Create file with meta line if it doesn't exist
  if (!fs.existsSync(filePath)) {
    const meta = JSON.stringify({ type: 'meta', title: null, created: new Date().toISOString() });
    fs.writeFileSync(filePath, meta + '\n', 'utf-8');
  }

  const line = JSON.stringify({ role: msg.role, content: msg.content, timestamp: new Date().toISOString() });
  fs.appendFileSync(filePath, line + '\n', 'utf-8');
}

/**
 * Load chat messages from a session's .jsonl file on disk.
 * Returns messages in the format expected by the agent loop.
 */
function loadSessionMessages(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
): Array<{ role: string; content: string }> {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];

  const messages: Array<{ role: string; content: string }> = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'meta') continue; // skip metadata line
      if (parsed.role && parsed.content !== undefined) {
        messages.push({ role: parsed.role, content: parsed.content });
      }
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}

/** Maximum number of conversation messages passed to the agent loop per turn. */
export const MAX_CONTEXT_MESSAGES = 50;

/**
 * Apply a sliding window to conversation history.
 * Returns at most MAX_CONTEXT_MESSAGES messages.
 * If the full history exceeds the limit, a system message is prepended
 * informing the agent that earlier context was truncated.
 */
export function applyContextWindow(
  fullHistory: Array<{ role: string; content: string }>,
  maxMessages: number = MAX_CONTEXT_MESSAGES,
): Array<{ role: string; content: string }> {
  if (fullHistory.length <= maxMessages) {
    return fullHistory;
  }

  // W3.5: Summarize dropped messages instead of just noting their count
  const droppedMessages = fullHistory.slice(0, fullHistory.length - maxMessages);
  const truncatedCount = droppedMessages.length;
  const summary = summarizeDroppedContext(droppedMessages);

  const truncationNotice: { role: string; content: string } = {
    role: 'system',
    content: `[Context summary — ${truncatedCount} earlier messages compressed]\n${summary}`,
  };
  return [truncationNotice, ...fullHistory.slice(-maxMessages)];
}

/** W3.5: Extract key decisions, topics, and requests from dropped messages */
function summarizeDroppedContext(messages: Array<{ role: string; content: string }>): string {
  const decisions: string[] = [];
  const topics: Set<string> = new Set();
  const userRequests: string[] = [];

  for (const msg of messages) {
    const text = msg.content;
    if (!text || text.length < 10) continue;

    // Extract decisions
    const decisionPatterns = [/\bdecid/i, /\bagreed\b/i, /\bchose\b/i, /\bselected\b/i, /\bwent with\b/i, /\bfinal call\b/i];
    if (decisionPatterns.some(p => p.test(text))) {
      const firstSentence = text.split(/[.!?\n]/)[0]?.trim();
      if (firstSentence && firstSentence.length > 10 && firstSentence.length < 200) {
        decisions.push(firstSentence);
      }
    }

    // Extract user request summaries (first line of user messages)
    if (msg.role === 'user') {
      const firstLine = text.split('\n')[0]?.trim();
      if (firstLine && firstLine.length > 15 && firstLine.length < 150) {
        userRequests.push(firstLine);
      }
    }
  }

  const lines: string[] = [];
  if (decisions.length > 0) {
    lines.push('Decisions made: ' + decisions.slice(0, 5).join(' | '));
  }
  if (userRequests.length > 0) {
    // Show first and last few requests to convey conversation arc
    const shown = userRequests.length <= 4
      ? userRequests
      : [...userRequests.slice(0, 2), '...', ...userRequests.slice(-2)];
    lines.push('Topics discussed: ' + shown.join(' → '));
  }
  if (lines.length === 0) {
    lines.push(`${messages.length} messages covering earlier conversation context.`);
  }
  return lines.join('\n');
}

export type AgentRunner = (config: AgentLoopConfig) => Promise<AgentResponse>;

/**
 * Build the skill-awareness section of the system prompt.
 * Exported for testability.
 */
export function buildSkillPromptSection(skills: Array<{ name: string; content: string }>): string {
  if (skills.length === 0) return '';
  let section = '\n\n# Active Skills\n\n';
  section += 'You have specialized skills loaded. **When a user request matches a loaded skill, follow that skill\'s instructions** instead of generic behavior. Skills represent curated, high-quality workflows.\n\n';
  section += '## Skill-Aware Routing\n';
  section += 'Before responding to any substantial user request:\n';
  section += '1. Check if any loaded skill matches the request (catch-up → catch-up skill, draft → draft-memo skill, etc.)\n';
  section += '2. If a skill matches, follow its structured workflow — it produces better output than ad-hoc responses\n';
  section += '3. If no skill matches but one could help, mention it: "I have a [skill-name] skill that could help with this"\n';
  section += '4. Use suggest_skill to find relevant skills when unsure\n\n';
  section += `## Loaded Skills (${skills.length})\n`;
  for (const skill of skills) {
    section += `\n### ${skill.name}\n${skill.content}\n`;
  }
  return section;
}

/** Generate a human-readable description of what a tool is doing */
function describeToolUse(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'web_search':
      return `Searching the web for "${input.query ?? ''}"...`;
    case 'web_fetch':
      return `Reading web page: ${input.url ?? ''}...`;
    case 'search_memory':
      return `Searching memory for "${input.query ?? ''}"...`;
    case 'save_memory':
      return `Saving to memory...`;
    case 'get_identity':
      return `Checking identity...`;
    case 'get_awareness':
      return `Checking current awareness state...`;
    case 'query_knowledge':
      return `Querying knowledge graph...`;
    case 'add_task':
      return `Adding task: "${input.title ?? ''}"...`;
    case 'correct_knowledge':
      return `Updating knowledge graph...`;
    case 'bash':
      return `Running command: ${String(input.command ?? '').slice(0, 80)}...`;
    case 'read_file':
      return `Reading file: ${input.path ?? ''}...`;
    case 'write_file':
      return `Writing file: ${input.path ?? ''}...`;
    case 'edit_file':
      return `Editing file: ${input.path ?? ''}...`;
    case 'search_files':
      return `Searching for files matching "${input.pattern ?? ''}"...`;
    case 'search_content':
      return `Searching file contents for "${input.pattern ?? ''}"...`;
    case 'git_status':
      return `Checking git status...`;
    case 'git_diff':
      return `Checking git diff...`;
    case 'git_log':
      return `Checking git log...`;
    case 'git_commit':
      return `Creating git commit...`;
    case 'create_plan':
      return `Creating plan: "${input.title ?? ''}"...`;
    case 'add_plan_step':
      return `Adding plan step...`;
    case 'execute_step':
      return `Executing plan step...`;
    case 'show_plan':
      return `Showing current plan...`;
    case 'generate_docx':
      return `Generating document: ${input.path ?? ''}...`;
    case 'list_skills':
      return 'Checking installed skills...';
    case 'create_skill':
      return `Creating skill: ${input.name ?? ''}...`;
    case 'delete_skill':
      return `Deleting skill: ${input.name ?? ''}...`;
    case 'read_skill':
      return `Reading skill: ${input.name ?? ''}...`;
    case 'search_skills':
      return `Searching for skills: "${input.query ?? ''}"...`;
    case 'suggest_skill':
      return `Looking for relevant skills...`;
    case 'acquire_capability':
      return `Searching for capabilities: "${input.need ?? ''}"...`;
    case 'install_capability':
      return `Installing capability: ${input.name ?? ''}...`;
    case 'compose_workflow':
      return `Analyzing task and composing workflow plan...`;
    case 'orchestrate_workflow':
      return `Running workflow: ${input.template ?? input.inline_template ? 'inline' : ''}...`;
    case 'spawn_agent':
      return `Spawning sub-agent "${input.name ?? ''}" (${input.role ?? ''})...`;
    case 'list_agents':
      return 'Checking sub-agents...';
    case 'get_agent_result':
      return `Getting sub-agent result...`;
    default:
      return `Using ${name}...`;
  }
}

export const chatRoutes: FastifyPluginAsync = async (server) => {
  // ── Use shared agent state from server ──────────────────────────────
  const {
    orchestrator,
    allTools,
    hookRegistry,
    costTracker,
    skills,
    userSystemPrompt,
    sessionHistories,
  } = server.agentState;
  // Read dynamically — may be updated to built-in proxy at runtime
  const getLitellmUrl = () => server.localConfig.litellmUrl;

  // W2.2: Register pre:memory-write validation hook — flags dramatic claims
  const DRAMATIC_PATTERNS = [
    /\b(shut\s*down|shutting\s*down|closing|dissolv|bankrupt|terminat|fired|laid\s*off|resign)\b/i,
    /\b(cancel|cancelled|abandon|scrap|kill)\s+(the\s+)?(company|project|deal|contract|engagement)\b/i,
    /\b(emergency|urgent|critical|crisis)\b.*\b(immediate|right\s*now|today)\b/i,
  ];
  hookRegistry.on('pre:memory-write', (ctx) => {
    const content = ctx.memoryContent ?? '';
    for (const pattern of DRAMATIC_PATTERNS) {
      if (pattern.test(content)) {
        console.warn('[memory-validation] Dramatic claim detected in save_memory:', content.slice(0, 100));
        // Don't block — but annotate the args so the tool can tag source appropriately
        // Future: could cancel and ask for confirmation
        break;
      }
    }
  });

  // C3: Cache the base system prompt per session to avoid rebuilding on every message
  const systemPromptCache = new Map<string, { prompt: string; workspace: string | undefined; workspaceId: string | undefined; skillCount: number; personaId: string | null }>();

  // Build the rich system prompt — behavioral specification, not just tool docs
  function buildSystemPrompt(workspacePath?: string, sessionId?: string, historyLength?: number, workspaceId?: string): string {
    // Resolve workspace persona (if workspace has one set)
    const wsConfig = workspaceId ? server.workspaceManager?.get(workspaceId) : null;
    const activePersonaId = wsConfig?.personaId ?? null;

    // Check cache: reuse if same session, workspace, workspaceId, skill count, and persona
    const cacheKey = sessionId ?? 'default';
    const cached = systemPromptCache.get(cacheKey);
    if (cached && cached.workspace === workspacePath && cached.workspaceId === workspaceId && cached.skillCount === skills.length && cached.personaId === activePersonaId) {
      return cached.prompt;
    }
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let prompt = '';

    // User's custom system prompt (highest priority — user overrides)
    if (userSystemPrompt) {
      prompt += userSystemPrompt + '\n\n';
    }

    // Orchestrator's built prompt (identity + self-awareness + preloaded context)
    prompt += orchestrator.buildSystemPrompt();

    prompt += `

# Who You Are

You are Waggle — a personal AI orchestrator with persistent memory, knowledge graph, and real-world tools.
You are NOT a chatbot. You are an autonomous agent that thinks, plans, acts, and learns.

You are one orchestrator among many — each user has their own Waggle, fine-tuned to them.
You remember everything important. You build knowledge over time. You get better with every interaction.

## Your Runtime (you already know this — do NOT call bash for date/time)
- Date: ${dateStr}
- Time: ${timeStr}
- Platform: ${process.platform} (${process.arch})
- Shell: ${process.platform === 'win32' ? 'cmd.exe (use /t flag for date, time)' : '/bin/sh'}
- Working directory: ${workspacePath ?? os.homedir()}
${workspacePath
  ? (workspacePath.includes('/files') || workspacePath.includes('\\files')
    ? `- Workspace files: managed storage (${workspacePath})\n- Generated files will appear in managed workspace storage.`
    : `- Workspace linked to: ${workspacePath} (all file operations are relative to this directory)\n- Generated files will appear in: ${workspacePath}`)
  : `- No workspace directory set. Use save_memory to store information instead of files.`}
${process.platform === 'win32' ? '- Windows note: use `date /t` and `time /t` (not bare `date` which prompts for input). Use `dir` instead of `ls`.' : ''}
${sessionId ? `- Session: ${sessionId}` : ''}
${historyLength && historyLength > 0 ? `- This is a continuing conversation (${historyLength} previous messages in context). You can see the full conversation history above.` : '- This is a new conversation. Search memory (search_memory) to recall what happened in previous sessions.'}

# HOW YOU THINK — Your Core Loop

For EVERY user message, follow this internal process:

## Step 1: RECALL (before anything else)
- Do I have relevant memories about this topic, person, or project?
- If the user references something from before, search_memory FIRST.
- If I have preloaded context above that's relevant, use it directly — don't re-search.
- NEVER claim "I don't remember" without actually searching.

## Step 2: ASSESS
- Is this a simple greeting/question? → Respond directly, warmly, concisely.
- Is this a factual question I'm not certain about? → Use tools (web_search, bash, read_file).
- Is this vague, ambiguous, or could be interpreted multiple ways? → Ask 1-2 targeted clarifying questions BEFORE acting. Do NOT guess. Do NOT generate a document. Examples: "make it better" → ask what aspect to improve; "fix this" → ask what's wrong; "help me" → ask with what; "create a report" without specifics → ask about scope, audience, key points. NEVER use generate_docx in response to an ambiguous request — clarify FIRST, generate AFTER.
- Is this a complex task? → Think through the approach before acting.
- Is this a multi-step operation? → Create a plan first (create_plan), then execute step by step.

## Step 3: ACT
- For simple, low-risk actions: just do them. Don't narrate "I'm going to read the file..." — just read it and give the result.
- For complex or sensitive actions: briefly explain what you're about to do and why.
- For destructive actions (delete, overwrite, git commit): confirm with the user first.
- Chain tools naturally: read → understand → decide → act → verify.

## Step 4: LEARN (save after every meaningful exchange)
You MUST call save_memory when any of these happen:
- A decision was made ("let's go with X", "we decided to...")
- The user stated a preference ("I prefer...", "always...", "never...", "call me...")
- The user corrected you — save the correction so you never repeat the mistake
- You completed a task — save the outcome and what was learned
- New project context was established (goals, constraints, stakeholders, timelines)
- The user shared important facts about themselves or their domain

Do NOT save: greetings, small talk, trivial questions, tool outputs, things already in memory.

**Routing:** Use target="personal" for preferences/style/corrections about you. Default (workspace) for everything else.

## Step 5: RESPOND
- Lead with the answer or result, not the process.
- Be concise: simple questions = 1-3 sentences. Complex = short paragraphs, max 10-12 lines.
- Be specific, not generic. "Your project has 14 packages" > "I can help with your project!"
- Have opinions when asked. "I'd do X because Y" > "Here are some options..."
- No filler: no "Great question!", no "That's interesting!", no "I'd be happy to help!"
- No emoji unless the user uses them.
- When corrected on style or approach: "You're right." Fix it. Move on.
- When corrected on FACTS that contradict a stored memory: DO NOT blindly accept. Search memory first. If you find a prior memory that says X but the user now claims Y, surface the conflict: "I have a stored memory that says X — should I update it to Y?" Only update after explicit confirmation. This prevents gradual memory drift.

# RESPONSE QUALITY RULES

## Anti-Hallucination Discipline
- ALWAYS distinguish what you KNOW (from memory, tools, or documents) from what you're REASONING or INFERRING.
- When citing recalled memories, say so: "From our previous discussion...", "You mentioned earlier that...", "Based on your workspace memory..."
- When you're reasoning without evidence, flag it: "I think..." or "My suggestion would be..." — never present inference as recalled fact.
- If you're unsure about something the user may have told you before, search_memory. If nothing found, say "I don't have that in memory" — never fabricate prior context.
- NEVER invent dates, numbers, names, or quotes. If you don't have exact data, say so and offer to look it up.

## Structured Output
When your response contains actionable information, use structure:
- **Decisions/options**: Use a short table or numbered list with trade-offs.
- **Action items/tasks**: Use a checkbox list (- [ ] item).
- **Summaries**: Use bullet points with bold lead words.
- **Multi-part answers**: Use headers (##) to separate sections.
- **Simple answers**: Just answer. Don't over-structure a one-line response.
Match the structure to the content — don't force everything into bullet points.

## Context Grounding
Your responses must feel specific to THIS workspace and THIS user:
- Reference workspace content by name: "In the Marketing workspace...", "Your project uses React + Node.js..."
- When recalling memories, include the relevant detail, not just "I found something in memory."
- Connect new information to existing context: "This relates to the decision you made about X..."
- If the workspace has accumulated context, USE it. A response that ignores available memory is a failure.
- Prefer concrete workspace-specific advice over generic suggestions. "Based on your 8 sessions here..." > "Generally speaking..."

## Professional Disclaimers
When your response touches legal, financial, medical, regulatory, tax, compliance, or investment topics:
- Include a brief disclaimer: "This is for informational purposes only and does not constitute professional [legal/financial/medical] advice. Consult a qualified professional for decisions in this area."
- This applies regardless of which persona is active, including the default (no persona) mode.
- Do NOT omit the disclaimer just because the user didn't ask for advice — if the content could be mistaken for professional guidance, include it.

# BEHAVIORAL RULES

## Memory-First
- ALWAYS search memory before claiming you don't know something the user may have told you before.
- When the user says "remember" or "we discussed" — that's your cue to search_memory immediately.
- Save the user's preferences, corrections, and important context. This is how you get smarter over time.
- Your memory is your competitive advantage. Use it constantly.

## Tool Intelligence
- NEVER guess at facts. If unsure, use tools: bash for system info, web_search for current info, read_file for project files.
- "I think", "probably", "likely" before a factual claim = you're guessing. Stop. Search instead.
- Chain tools: web_search → web_fetch for deep reading. search_files → read_file for code understanding.
- When researching, give the user the INSIGHT, not a copy of search results.
- After using tools, synthesize the results into workspace context. Don't dump raw output — explain what it means for THIS project.

## Narration Heuristics — Know When to Talk
- Simple tool calls (read_file, search_memory, bash date): just do them silently. Share the result.
- Multi-step work: briefly state your approach. "Let me check your git status and recent commits."
- Sensitive/destructive ops: always explain before acting. "I'll delete the old config and create a new one."
- NEVER narrate the obvious: "I'm going to use the bash tool to run a command" — just run it.

## Error Recovery
- Tool failed? Try a different approach. Don't just report the error — solve the problem.
- Command timed out? Try a simpler command, or break the task into smaller steps.
- Can't find a file? Search for it. Can't search? Ask the user.
- Network error on web_search? Tell the user briefly, continue with what you know.
- NEVER show raw error traces to the user. Summarize what went wrong and what you'll do about it.

## Planning for Complex Tasks
- If a task has 3+ steps, use create_plan to outline them.
- Execute each step with execute_step as you complete it.
- If a step fails, adapt the plan — don't blindly continue.
- Share the plan with the user so they know what to expect.

# HIGH-VALUE WORK PATTERNS

## Drafting from Context
When the user asks you to draft, write, or produce something (email, memo, summary, plan, update, brief, report):

1. **Gather context first** — search_memory for relevant workspace context. Check recalled memories above. Read relevant files if referenced.
2. **Apply personal style** — search_memory with scope="personal" for style preferences (tone, format, length). If the user prefers bullet points, don't write paragraphs. If they prefer direct language, skip formalities.
3. **Draft with specifics** — use actual names, dates, decisions, and facts from memory. A draft that says "the project" when memory contains "the Marketing Q2 campaign" is a failure. Ground every claim in real context.
4. **Structure for editing** — the draft should be immediately usable, not a wall of text. Use clear sections, short paragraphs, and headers where appropriate.
5. **Offer the right format** — short drafts inline in chat. Long drafts (>1 page) via generate_docx so the user gets a real file they can edit and share.
6. **State what you used** — briefly note what context informed the draft: "Based on your 3 recent sessions and the decision to use React..."

Draft types and what to include:
- **Status update / progress report**: What was done, what's in progress, what's blocked, next steps. Pull from recent session history and decisions.
- **Email / message**: Match the user's tone. Include specific context. Keep it sendable — subject line, greeting, body, sign-off.
- **Summary / brief**: Key points, decisions made, open questions. Organized by topic, not chronology.
- **Plan / proposal**: Goal, approach, steps, timeline, risks. Grounded in what's already known about the project.
- **Meeting notes / action items**: Decisions, owners, deadlines, next meeting topics.

## Decision Compression
When the user asks "what matters?", "what should I do next?", "catch me up", or similar:

1. **Search broadly** — search_memory for recent context, decisions, open items, blockers.
2. **Compress, don't summarize** — the user wants signal, not a recap. Distill to: what changed, what matters, what needs attention, what to do next.
3. **Be opinionated** — rank items by importance. "The most important thing right now is X because Y." Don't present everything as equally important.
4. **Structure the response**:
   - **Key issues** (what demands attention)
   - **Recent decisions** (what was decided and why)
   - **Open questions** (what's unresolved)
   - **Recommended next action** (what to do right now)
   - **Blockers** (what's preventing progress)
5. **Be specific** — "You need to finalize the API design before the frontend can proceed" > "There are some pending items to address."

## Research in Context
When the user asks you to research something:

1. **Start with memory** — search_memory first. What do you already know about this topic in this workspace?
2. **Then search externally** — web_search for current information. web_fetch to go deeper on promising results.
3. **Synthesize into project context** — don't just report findings. Explain what they mean for THIS workspace and THIS user's goals.
4. **Save the findings** — use save_memory to store key discoveries so they're available in future sessions. This is how the workspace gets smarter.
5. **Connect to existing knowledge** — "This confirms your earlier decision to..." or "This changes the picture because..."
6. **Cite sources** — for external research, include URLs or reference names so the user can verify.

# TOOLS

## Web (for current information)
- web_search: Search DuckDuckGo. Use for current events, products, releases, docs.
- web_fetch: Read any URL. Use after web_search to go deeper on a result.

## Memory (your persistent brain — two minds)
You have TWO memory stores:
- **Workspace mind**: Project context, decisions, task progress, domain knowledge. Specific to this workspace.
- **Personal mind**: Your communication preferences, style patterns, ways of working. Carries across ALL workspaces.

Tools:
- search_memory: Search past knowledge. Searches BOTH minds by default. Use scope="personal" or scope="workspace" to narrow.
- save_memory: Save important facts. Defaults to WORKSPACE mind. Use target="personal" for: user preferences, communication style, corrections about YOU, cross-workspace knowledge.
- get_identity: Who you are (always from personal mind).
- get_awareness: Current tasks, active items, flags.
- query_knowledge: Query your knowledge graph for entities and relationships.
- add_task: Track a task in your awareness layer.
- correct_knowledge: Fix or invalidate a knowledge entity.

**Save routing rules:**
- Project decisions, meeting notes, task outcomes → workspace mind
- "I prefer bullet points", "call me Marko", style corrections → personal mind
- If unsure, save to workspace (most things are project-specific).

## System (interact with the local machine)
- bash: Run shell commands. Use for system info, file operations, processes.
- read_file: Read file contents (path relative to workspace).
- write_file: Create or overwrite a file.
- edit_file: Replace exact strings in a file (surgical edits).
- search_files: Find files by glob pattern.
- search_content: Regex search through file contents.

## Git (version control)
- git_status, git_diff, git_log, git_commit

## Documents (create deliverables)
- generate_docx: Create formatted Word documents from markdown. Supports headings, bold, italic, tables, lists, title pages, table of contents.
  Use for reports, proposals, briefs — any deliverable the user needs as a file.

## Skills & Discovery (extend your capabilities)
- list_skills: Show all installed skills and plugins.
- create_skill: Create a new skill (markdown instructions) that persists across sessions.
- delete_skill: Remove an installed skill.
- read_skill: Read the full content of a skill.
- search_skills: Search for capabilities — checks installed skills and suggests built-in tools.
- suggest_skill: Get contextual skill recommendations based on what the user is asking.
- **acquire_capability**: Detect capability gaps and search for installable skills. Use this when you encounter a task that could benefit from specialized guidance.
- **install_capability**: Install a skill identified by acquire_capability (requires user approval).

### Capability Acquisition — When You Lack Something

When the user asks for something that needs structured domain expertise (risk assessment, research synthesis, code review, decision analysis, etc.) and you don't have a matching loaded skill:

1. **Call acquire_capability** with a description of what you need. It will:
   - Check if a native tool or active skill already covers the need
   - Search the starter skill pack for installable capabilities
   - Return a structured proposal with candidates and a recommendation
2. **If it recommends installing a skill**: Tell the user what was found and why. Then call install_capability with the exact name and source.
3. **The user will see an approval prompt.** Wait for their approval.
4. **After approval**: The skill content is returned to you. Apply it immediately to the user's original task.

Do NOT skip the acquire_capability step. Do NOT guess skill names for install_capability — always use the exact values from the proposal.

If acquire_capability says a native tool or active skill already handles the need, use that directly instead of installing anything.

## Sub-Agents (delegate specialized work)
- spawn_agent: Spawn a specialist sub-agent with a specific role and task. The sub-agent runs autonomously and returns its result.
  Roles: researcher, writer, coder, analyst, reviewer, planner, or "custom" with specific tools.
  Use when: task is complex and benefits from focused specialization, or when multiple independent tasks can be done in sequence.
- list_agents: Show active and completed sub-agents.
- get_agent_result: Retrieve the full result from a completed sub-agent.

## Planning (structured multi-step work)
- create_plan, add_plan_step, execute_step, show_plan

## Workflow Composition (for complex multi-phase tasks)
- **compose_workflow**: Analyze a task and get a recommended execution approach. Returns a plan with steps and the lightest sufficient execution mode.
- **orchestrate_workflow**: Run a multi-agent workflow (named template or inline template from compose_workflow).

### When to Use Workflow Composition

Most tasks do NOT need workflow composition. Use it only when a request has **multiple distinct phases** (e.g., "research X, then compare options, then draft a recommendation").

**Decision flow:**
1. Simple question or single-step task → respond directly (no tools needed)
2. Multi-step but single-domain task (e.g., "write a report") → use a loaded skill or create_plan
3. Multi-phase task with distinct work types → call compose_workflow to get a structured plan
4. Only if compose_workflow recommends sub-agents AND the task genuinely warrants parallel specialists → use orchestrate_workflow

**Never** jump straight to orchestrate_workflow for tasks you can handle directly. The compose_workflow tool will tell you when sub-agents are actually warranted.

## Intelligence Defaults
When approaching any task:
1. SKILL CHECK: Before answering generically, check if an installed skill covers this topic. Use suggest_skill to find relevant skills.
2. WORKFLOW ROUTING: For multi-step tasks (research, compare, draft, review, plan), use compose_workflow to select the optimal execution mode rather than doing everything sequentially.
3. SUB-AGENT DELEGATION: For research-heavy tasks, consider spawning a researcher sub-agent. For review tasks, spawn a reviewer. Don't do everything in one loop when delegation would produce better results.
4. COMMAND AWARENESS: When the user's request matches a slash command, suggest it. Examples: /catchup for workspace re-entry, /research for investigation, /draft for document creation, /decide for decision analysis.
5. CAPABILITY DISCOVERY: If you lack a tool or skill for the task, use acquire_capability to search for installable capabilities before saying you can't do something.`;

    // Append loaded skills with active integration instructions
    prompt += buildSkillPromptSection(skills);

    // Workspace Now — inject structured context so the agent is grounded on first turn
    if (workspaceId) {
      try {
        const nowBlock = buildWorkspaceNowBlock({
          dataDir: server.localConfig.dataDir,
          workspaceId,
          wsManager: server.workspaceManager,
          activateWorkspaceMind: server.agentState.activateWorkspaceMind,
          cronSchedules: server.cronStore.list(),
        });
        if (nowBlock) {
          // Use structured state prompt when available (richer: open questions, blockers, stale threads)
          if (nowBlock.structuredState) {
            prompt += '\n\n' + formatWorkspaceStatePrompt(nowBlock.structuredState, nowBlock.workspaceName);
          } else {
            prompt += '\n\n' + formatWorkspaceNowPrompt(nowBlock);
          }
        }
      } catch {
        // Non-blocking — if workspace context fails, continue without it
      }
    }

    // W3.3: Inject actionable correction signals — user corrections from prior sessions
    try {
      const signalStore = orchestrator.getImprovementSignals();
      if (signalStore) {
        const actionable = signalStore.getActionable();
        if (actionable.length > 0) {
          prompt += '\n\n# User Corrections (from prior sessions — follow these)\n';
          for (const signal of actionable) {
            prompt += `- ${signal.detail} (observed ${signal.count}x)\n`;
          }
        }
      }
    } catch { /* non-blocking */ }

    // W1.3: Apply active persona instructions (extends, not replaces, core prompt)
    // W7.3: Pass workspace tone to composePersonaPrompt
    const workspaceTone = wsConfig?.tone;
    if (activePersonaId) {
      const persona = getPersona(activePersonaId);
      prompt = composePersonaPrompt(prompt, persona, undefined, workspaceTone);
    } else if (workspaceTone) {
      // Even without a persona, apply tone if workspace has one set
      prompt = composePersonaPrompt(prompt, null, undefined, workspaceTone);
    }

    // Item 3: Regulated-persona disclaimer enforcement
    // Personas in regulated domains (HR, Legal, Finance) must include a professional
    // disclaimer on every response. This reinforces the persona's own instructions.
    const REGULATED_PERSONAS = ['hr-manager', 'legal-professional', 'finance-owner'];
    if (activePersonaId && REGULATED_PERSONAS.includes(activePersonaId)) {
      prompt += '\n\n## Professional Disclaimer Requirement\nYou MUST include an appropriate professional disclaimer at the end of EVERY response. This is non-negotiable. The disclaimer must match your role (HR: not legal advice, Legal: not attorney-client relationship, Finance: verify with accountant).';
    }

    // C3: Cache the built prompt
    systemPromptCache.set(cacheKey, { prompt, workspace: workspacePath, workspaceId, skillCount: skills.length, personaId: activePersonaId });

    return prompt;
  }

  // POST /api/chat — SSE streaming chat endpoint
  server.post<{
    Body: { message: string; workspace?: string; workspaceId?: string; model?: string; session?: string; workspacePath?: string };
  }>('/api/chat', async (request, reply) => {
    // P0-4: Accept both 'workspace' and 'workspaceId' for backwards compat
    const { message, workspace: _ws, workspaceId: _wsId, model, session, workspacePath: explicitWorkspacePath } = request.body ?? {};
    const workspace = _ws ?? _wsId;

    // A2: Resolve workspace directory — use explicit path, workspace config, or virtual storage
    // NEVER fall back to user homedir — use managed storage instead
    let workspacePath = explicitWorkspacePath;
    if (!workspacePath && workspace) {
      const wsConfig = server.workspaceManager?.get(workspace);
      if (wsConfig?.directory && fs.existsSync(wsConfig.directory)) {
        workspacePath = wsConfig.directory; // linked mode
      } else if (workspace !== 'default') {
        // Virtual workspace storage — managed files directory
        workspacePath = path.join(server.localConfig.dataDir, 'workspaces', workspace, 'files');
      }
    }

    // Validation — return standard JSON error before starting SSE
    if (!message) {
      return reply.status(400).send({ error: 'message is required' });
    }
    // F17: Message size limit — reject payloads over 50KB to prevent abuse
    const MAX_MESSAGE_LENGTH = parseInt(process.env.WAGGLE_MAX_MESSAGE_LENGTH ?? '50000', 10);
    if (message.length > MAX_MESSAGE_LENGTH) {
      return reply.status(400).send({ error: `Message too long (${message.length} chars, max ${MAX_MESSAGE_LENGTH})`, code: 'MESSAGE_TOO_LONG' });
    }

    // Security: scan for prompt injection patterns
    const injectionResult = scanForInjection(message, 'user_input');
    if (injectionResult.score >= 0.7) {
      // High-confidence injection: block entirely
      console.warn('[security] Prompt injection BLOCKED (score %.2f):', injectionResult.score, injectionResult.flags);
      return reply.code(400).send({
        error: 'Message blocked by security scanner',
        code: 'INJECTION_DETECTED',
        flags: injectionResult.flags,
      });
    } else if (injectionResult.score >= 0.3) {
      console.warn('[security] Potential prompt injection detected (score %.2f):', injectionResult.score, injectionResult.flags);
    }

    // Hijack the response so Fastify doesn't try to send its own reply
    await reply.hijack();

    // Set SSE headers via raw response (include CORS since hijack bypasses Fastify plugins)
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': validateOrigin(request.headers.origin as string | undefined),
    });

    // Helper to write SSE events
    const sendEvent = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Graceful shutdown: abort agent loop when client disconnects
    const abortController = new AbortController();
    request.raw.on('close', () => {
      abortController.abort();
    });

    // Declare at handler scope so error handler can surface recalled memories (P1-4)
    let recalledContext = '';

    try {
      const hasCustomRunner = !!server.agentRunner;

      // Resolve the agent runner (injectable for tests)
      const agentRunner: AgentRunner = server.agentRunner ?? runAgentLoop;

      // Resolve model: request param > workspace config > global default > fallback
      // Per-workspace model selection: each workspace can specify its own model
      const wsModelConfig = workspace ? server.workspaceManager?.get(workspace)?.model : undefined;
      const resolvedModel = model ?? wsModelConfig ?? server.agentState.currentModel ?? 'claude-sonnet-4-6';

      // ── Conversation history management (moved before LLM check so echo mode also persists) ──
      const sessionId = session ?? workspace ?? 'default';
      const effectiveWorkspace = workspace ?? 'default';

      // Viewer permission enforcement: viewers in team workspaces cannot chat
      if (workspace && workspace !== 'default') {
        const wsConfig = server.workspaceManager?.get(workspace);
        if (wsConfig?.teamId && wsConfig?.teamRole === 'viewer') {
          return reply.status(403).send({
            error: 'Viewers cannot send messages in team workspaces. Ask a team admin to upgrade your role.',
            code: 'VIEWER_READ_ONLY',
          });
        }
      }

      // Get or create session history — load from disk if not in RAM
      if (!sessionHistories.has(sessionId)) {
        const saved = loadSessionMessages(
          server.localConfig.dataDir, effectiveWorkspace, sessionId
        );
        sessionHistories.set(sessionId, saved);
      }
      const history = sessionHistories.get(sessionId)!;

      // Add user message to history and persist to disk
      history.push({ role: 'user', content: message });
      persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'user', content: message });

      // Check if LiteLLM is available — if not, use echo mode
      // F2 fix: When using the built-in Anthropic proxy, the /health/liveliness
      // endpoint doesn't exist — so the HTTP probe always fails, dropping into
      // echo mode even when an API key is configured. Instead, trust the
      // provider status that was determined at startup (or updated at runtime).
      let litellmAvailable = hasCustomRunner; // trust injected runners
      if (!hasCustomRunner) {
        const llmStatus = server.agentState.llmProvider;
        if (llmStatus.provider === 'anthropic-proxy' && llmStatus.health === 'healthy') {
          // Built-in proxy with a valid API key — skip HTTP probe
          litellmAvailable = true;
        } else {
          try {
            const healthHeaders: Record<string, string> = {};
            const token = server.agentState.wsSessionToken;
            if (token) {
              healthHeaders['Authorization'] = `Bearer ${token}`;
            }
            const healthRes = await fetch(`${getLitellmUrl()}/health/liveliness`, {
              signal: AbortSignal.timeout(3000),
              headers: healthHeaders,
            });
            litellmAvailable = healthRes.ok;
          } catch {
            // LiteLLM not reachable
          }
        }
      }

      // ── Slash command routing (works even in echo mode) ──
      const { commandRegistry } = server.agentState;
      if (commandRegistry.isCommand(message)) {
        // Build a lightweight command context (same as commands.ts route)
        const cmdContext = {
          workspaceId: effectiveWorkspace,
          sessionId,
          searchMemory: async (query: string): Promise<string> => {
            try {
              const recall = await orchestrator.recallMemory(query);
              if (recall.count === 0) return 'No relevant memories found.';
              const items = (recall.recalled ?? []).slice(0, 5);
              return items.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n');
            } catch {
              return 'Memory search unavailable.';
            }
          },
          getWorkspaceState: async (): Promise<string> => {
            const block = buildWorkspaceNowBlock({
              dataDir: server.localConfig.dataDir,
              workspaceId: effectiveWorkspace,
              wsManager: server.workspaceManager,
              activateWorkspaceMind: server.agentState.activateWorkspaceMind,
              cronSchedules: server.cronStore.list(),
            });
            if (!block) return 'No workspace state available.';
            return formatWorkspaceNowPrompt(block);
          },
          listSkills: (): string[] => {
            return server.agentState.skills.map(s => s.name);
          },
        };
        const cmdResult = await commandRegistry.execute(message, cmdContext);

        // B1-B7: Check if the command wants to be re-processed through the agent loop
        if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && litellmAvailable) {
          // Extract the rewritten message and fall through to agent loop processing
          const rerouted = cmdResult.slice(AGENT_LOOP_REROUTE_PREFIX.length);
          sendEvent('step', { content: `Processing /${message.trim().split(/\s+/)[0].slice(1)} via AI...` });
          // Replace the message in history with the original slash command (already persisted)
          // and process the rewritten message through the agent loop below
          // We achieve this by NOT returning here — the code falls through to the agent loop
          // with the rerouted message replacing the original
          Object.assign(request, { _reroutedMessage: rerouted });
        } else if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && !litellmAvailable) {
          const cmdName = message.trim().split(/\s+/)[0];
          const friendlyError = `**${cmdName} requires AI** — This command needs a working LLM connection.\n\nConfigure an API key in Settings > API Keys, then try again.`;
          const words = friendlyError.split(' ');
          for (const word of words) {
            sendEvent('token', { content: word + ' ' });
            await new Promise((r) => setTimeout(r, 10));
          }
          history.push({ role: 'assistant', content: friendlyError });
          persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: friendlyError });
          sendEvent('done', { content: friendlyError, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, toolsUsed: [] });
        } else {
          // Stream the command result as SSE tokens
          const cmdWords = cmdResult.split(' ');
          for (const word of cmdWords) {
            sendEvent('token', { content: word + ' ' });
            await new Promise((r) => setTimeout(r, 10));
          }
          // Persist command result
          history.push({ role: 'assistant', content: cmdResult });
          persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: cmdResult });
          sendEvent('done', {
            content: cmdResult,
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            toolsUsed: [],
          });
        }
      }

      // B1-B7: Check if a slash command requested agent-loop rerouting
      const reroutedMessage = (request as any)._reroutedMessage as string | undefined;
      const shouldRunAgentLoop = reroutedMessage || (!commandRegistry.isCommand(message) && litellmAvailable);
      const shouldEchoMode = !reroutedMessage && !commandRegistry.isCommand(message) && !litellmAvailable;

      if (shouldEchoMode) {
        // Echo mode — respond without LLM so the UI is functional
        const echoResponse = `**Waggle is running in local mode** (no LLM proxy connected).\n\nYour message: "${message}"\n\nTo enable AI responses, configure an API key in Settings > API Keys.`;
        const words = echoResponse.split(' ');
        for (const word of words) {
          sendEvent('token', { content: word + ' ' });
          await new Promise((r) => setTimeout(r, 15));
        }
        // Persist echo response so session continuity is maintained
        history.push({ role: 'assistant', content: echoResponse });
        persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: echoResponse });
        sendEvent('done', {
          content: echoResponse,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          toolsUsed: [],
        });
      }

      if (shouldRunAgentLoop) {
        // Use rerouted message if from a slash command, otherwise use original
        const agentMessage = reroutedMessage ?? message;

        // ── Budget check — warn if workspace is over budget ──
        if (!hasCustomRunner && effectiveWorkspace !== 'default') {
          const wsBudgetConfig = server.workspaceManager?.get(effectiveWorkspace);
          if (wsBudgetConfig?.budget != null && wsBudgetConfig.budget > 0) {
            const wsUsage = costTracker.getWorkspaceCost(effectiveWorkspace);
            if (wsUsage >= wsBudgetConfig.budget) {
              sendEvent('step', { content: `\u26a0\ufe0f Budget limit reached ($${wsUsage.toFixed(2)} / $${wsBudgetConfig.budget.toFixed(2)}). Responses may be limited.` });
            }
          }
        }

        // ── Activate workspace mind (A2: guard against silent fallback) ──
        if (!hasCustomRunner && workspace) {
          const activated = server.agentState.activateWorkspaceMind(effectiveWorkspace);
          if (!activated) {
            sendEvent('step', { content: `Warning: could not activate workspace memory for "${effectiveWorkspace}". Using personal memory only.` });
          }
        }

        // ── Automatic memory recall ─────────────────────────────
        if (!hasCustomRunner) {
          try {
            sendEvent('step', { content: 'Recalling relevant memories...' });
            sendEvent('tool', { name: 'auto_recall', input: { query: agentMessage } });
            const recallStart = Date.now();
            const recall = await orchestrator.recallMemory(agentMessage);
            const recallDuration = Date.now() - recallStart;
            if (recall.count > 0) {
              recalledContext = '\n\n' + recall.text;
              // B5: Include content snippets so ToolCard can show what was recalled
              const snippets = (recall.recalled ?? []).slice(0, 3);
              const snippetText = snippets.map(s => `  - ${s}`).join('\n');
              const resultText = `${recall.count} memories recalled:\n${snippetText}`;
              sendEvent('step', { content: `Recalled ${recall.count} relevant memor${recall.count === 1 ? 'y' : 'ies'}.` });
              sendEvent('tool_result', { name: 'auto_recall', result: resultText, duration: recallDuration, isError: false });
            } else {
              sendEvent('tool_result', { name: 'auto_recall', result: 'No relevant memories found', duration: recallDuration, isError: false });
            }
          } catch {
            // Non-blocking — if recall fails, continue without it
          }
        }

        // Build system prompt (with workspace path awareness + recalled memories)
        // GAP-006: Prepend ambiguity guard when user message is too brief/vague
        // Q11:A — Context-aware: only trigger ambiguity detection on the FIRST user
        // message in a session. Mid-conversation follow-ups like "yes", "run it",
        // "LGTM" are valid replies and should not be flagged.
        const priorUserMessages = history.filter((m: { role: string }) => m.role === 'user').length;
        const isFirstUserMessage = priorUserMessages <= 1; // history already includes current message
        const shouldCheckAmbiguity = isFirstUserMessage;
        const ambiguityPrefix = (!hasCustomRunner && shouldCheckAmbiguity && isAmbiguousMessage(agentMessage)) ? AMBIGUITY_PROMPT : '';
        const systemPrompt = hasCustomRunner
          ? 'You are a helpful AI assistant.'
          : ambiguityPrefix + buildSystemPrompt(workspacePath, sessionId, history.length, effectiveWorkspace) + recalledContext;

        // Register a per-request pre:tool hook for confirmation gates
        // This fires during the agent loop and pauses until user approves/denies
        const autoApprove = process.env.WAGGLE_AUTO_APPROVE === '1' || process.env.WAGGLE_AUTO_APPROVE === 'true';
        const unregisterHook = hasCustomRunner ? undefined : hookRegistry.on('pre:tool', async (ctx) => {
          if (!ctx.toolName || !needsConfirmation(ctx.toolName, (ctx.args ?? {}) as Record<string, unknown>)) return;

          // H3: Auto-approve all tool requests when WAGGLE_AUTO_APPROVE=1 (testing only)
          if (autoApprove) {
            sendEvent('step', { content: `\u2714 ${ctx.toolName} auto-approved (test mode)` });
            return;
          }

          const requestId = crypto.randomUUID();
          const toolName = ctx.toolName;
          const input = (ctx.args ?? {}) as Record<string, unknown>;

          // For install_capability, enrich the event with trust metadata
          let trustMeta: Record<string, unknown> | undefined;
          if (toolName === 'install_capability') {
            try {
              const skillName = input.name as string ?? '';
              const source = input.source as string ?? '';
              // Read starter skill content for trust assessment
              const { getStarterSkillsDir } = await import('@waggle/sdk');
              const starterPath = path.join(getStarterSkillsDir(), `${skillName}.md`);
              const content = fs.existsSync(starterPath) ? fs.readFileSync(starterPath, 'utf-8') : '';
              const trust = assessTrust({ capabilityType: 'skill', source, content });
              trustMeta = {
                riskLevel: trust.riskLevel,
                approvalClass: trust.approvalClass,
                trustSource: trust.trustSource,
                assessmentMode: trust.assessmentMode,
                explanation: trust.explanation,
                permissions: trust.permissions,
              };
            } catch { /* trust enrichment is best-effort */ }
          }

          // Send approval_required SSE event to the client
          sendEvent('approval_required', { requestId, toolName, input, ...trustMeta });
            // F2: Audit trail — approval requested
            emitAuditEvent(server, {
              workspaceId: effectiveWorkspace,
              eventType: 'approval_requested',
              toolName,
              input: JSON.stringify(input),
              sessionId,
            });

          // Wait for the client to approve or deny
          const approved = await new Promise<boolean>((resolve) => {
            server.agentState.pendingApprovals.set(requestId, {
              resolve,
              toolName,
              input,
              timestamp: Date.now(),
            });

            // Auto-DENY after 5 minutes if no response — fail safe, not fail open
            setTimeout(() => {
              if (server.agentState.pendingApprovals.has(requestId)) {
                server.agentState.pendingApprovals.delete(requestId);
                console.warn(`[security] Approval timed out for ${toolName} (requestId: ${requestId}) — auto-denied for safety`);
                resolve(false);
              }
            }, 300_000);
          });

          if (!approved) {
            sendEvent('step', { content: `\u2716 ${toolName} denied by user` });
            emitAuditEvent(server, { workspaceId: effectiveWorkspace, eventType: 'approval_denied', toolName, sessionId, approved: false });
            return { cancel: true, reason: `User denied ${toolName}` };
          }
          sendEvent('step', { content: `\u2714 ${toolName} approved` });
            emitAuditEvent(server, { workspaceId: effectiveWorkspace, eventType: 'approval_granted', toolName, sessionId, approved: true });
        });

        // Use workspace-scoped tools if a workspacePath was specified
        let effectiveTools = hasCustomRunner
          ? []
          : workspacePath
            ? server.agentState.buildToolsForWorkspace(workspacePath)
            : allTools;

        // W3.1: Filter tools by persona — non-technical personas get a reduced tool set
        // Always include memory tools (search_memory, save_memory) + discovery tools regardless of persona
        const ALWAYS_AVAILABLE = new Set([
          'search_memory', 'save_memory', 'get_identity', 'get_awareness', 'query_knowledge',
          'add_task', 'correct_knowledge', 'list_skills', 'search_skills', 'suggest_skill',
          'acquire_capability', 'install_capability', 'compose_workflow', 'create_plan',
          'add_plan_step', 'execute_step', 'show_plan',
        ]);
        // Resolve persona from workspace config (same source as buildSystemPrompt)
        const wsConfig = effectiveWorkspace ? server.workspaceManager?.get(effectiveWorkspace) : null;
        const activePersonaId = wsConfig?.personaId ?? null;
        if (!hasCustomRunner && activePersonaId) {
          const persona = getPersona(activePersonaId);
          if (persona && persona.tools.length > 0) {
            const allowedTools = new Set([...persona.tools, ...ALWAYS_AVAILABLE]);
            effectiveTools = effectiveTools.filter(t => allowedTools.has(t.name));
          }
        }

        // Track tool execution times for duration reporting
        const toolStartTimes = new Map<string, number>();
        let toolStartCounter = 0;

        // Build capability router for intelligent tool-not-found handling
        const capabilityRouter = hasCustomRunner ? undefined : new CapabilityRouter({
          toolNames: effectiveTools.map(t => t.name),
          skills: server.agentState.skills,
          plugins: server.agentState.pluginRuntimeManager.getActive().map(p => ({
            name: p.getManifest().name,
            description: p.getManifest().description ?? '',
            skills: p.getContributedSkills(),
          })),
          mcpServers: Object.keys(server.agentState.mcpRuntime.getServerStates()),
          subAgentRoles: ['researcher', 'writer', 'coder', 'analyst', 'reviewer', 'planner'],
          mcpRuntime: server.agentState.mcpRuntime,
        });

        // B1-B7: If this is a rerouted slash command, replace the last user message
        // with the enriched agent prompt so the LLM gets better instructions
        if (reroutedMessage) {
          // The original slash command is already persisted to disk at line 724.
          // For the agent loop, swap in the rerouted message so the LLM sees the
          // enhanced prompt (e.g., "Draft the following. Search memory first...")
          let lastUserIdx = -1;
          for (let i = history.length - 1; i >= 0; i--) {
            if ((history[i] as any).role === 'user') { lastUserIdx = i; break; }
          }
          if (lastUserIdx >= 0) {
            history[lastUserIdx] = { role: 'user', content: reroutedMessage };
          }
        }

        // Apply sliding window to conversation history — keep full history in RAM
        // for persistence but only send recent messages to the agent loop
        const windowedMessages = applyContextWindow(history);

        // Governance policies for team workspaces
        let governancePolicies: { blockedTools?: string[]; allowedSources?: string[] } | undefined;
        if (wsConfig?.teamId) {
          try {
            const port = (server.server.address() as any)?.port ?? 3333;
            const govRes = await fetch(`http://127.0.0.1:${port}/api/team/governance/permissions?workspaceId=${effectiveWorkspace}`, {
              signal: AbortSignal.timeout(2000),
            });
            if (govRes.ok) {
              const gov = await govRes.json() as any;
              if (gov.permissions) {
                // Extract blocked tools from the user's role policy
                const rolePolicy = gov.permissions.find?.((p: any) => p.role === wsConfig.teamRole);
                if (rolePolicy?.blockedTools) {
                  governancePolicies = { blockedTools: rolePolicy.blockedTools };
                }
              }
            }
          } catch { /* governance not available — allow all */ }
        }

        // Build agent loop config — with windowed conversation history + hooks
        const agentConfig: AgentLoopConfig = {
          litellmUrl: getLitellmUrl(),
          litellmApiKey: server.agentState.litellmApiKey,
          model: resolvedModel,
          systemPrompt,
          tools: effectiveTools,
          messages: windowedMessages,
          stream: true,
          maxTurns: 200, // Persistent agents need many turns for complex research + document generation
          hooks: hasCustomRunner ? undefined : hookRegistry,
          capabilityRouter,
          governancePolicies,
          signal: abortController.signal,
          onToken: (token: string) => {
            sendEvent('token', { content: token });
          },
          onToolUse: (name: string, input: Record<string, unknown>) => {
            // Send human-readable step description + raw tool event
            const stepText = describeToolUse(name, input);
            sendEvent('step', { content: stepText });
            sendEvent('tool', { name, input });
            // Track start time for duration calculation
            toolStartTimes.set(name + ':' + toolStartCounter++, Date.now());
            // F2: Audit trail — log tool call
            emitAuditEvent(server, {
              workspaceId: effectiveWorkspace,
              eventType: 'tool_call',
              toolName: name,
              input: JSON.stringify(input),
              sessionId,
              model: resolvedModel,
            });
          },
          onToolResult: (name: string, input: Record<string, unknown>, result: string) => {
            // Calculate duration from the most recent start of this tool
            let duration: number | undefined;
            // Find the latest matching start entry
            for (const [key, startTime] of toolStartTimes) {
              if (key.startsWith(name + ':')) {
                duration = Date.now() - startTime;
                toolStartTimes.delete(key);
                break;
              }
            }

            // Send tool_result SSE event so client can update status + show result
            const isError = result.startsWith('Error:') || result.startsWith('Error ');
            sendEvent('tool_result', { name, result, duration, isError });
            // F2: Audit trail — log tool result (truncated output)
            emitAuditEvent(server, {
              workspaceId: effectiveWorkspace,
              eventType: 'tool_result',
              toolName: name,
              output: result.length > 2000 ? result.slice(0, 2000) + '...[truncated]' : result,
              sessionId,
            });

            // Emit file_created events for file-writing tools
            const fileTools: Record<string, 'write' | 'edit' | 'generate'> = {
              write_file: 'write',
              edit_file: 'edit',
              generate_docx: 'generate',
            };
            const fileAction = fileTools[name];
            if (fileAction && input.path && !result.startsWith('Error')) {
              const filePath = String(input.path);
              sendEvent('file_created', { filePath, fileAction });
            }

            // TeamSync push — after save_memory in team workspace (fire-and-forget)
            if (name === 'save_memory' && workspace && !result.startsWith('Error')) {
              const pushWsConfig = server.workspaceManager?.get(effectiveWorkspace);
              if (pushWsConfig?.teamId) {
                try {
                  const waggleConfig = new WaggleConfig(server.localConfig.dataDir);
                  const teamServer = waggleConfig.getTeamServer();
                  if (teamServer?.token && pushWsConfig.teamServerUrl) {
                    const sync = new TeamSync({
                      teamServerUrl: pushWsConfig.teamServerUrl,
                      teamSlug: pushWsConfig.teamId,
                      authToken: teamServer.token,
                      userId: teamServer.userId ?? 'local-user',
                      displayName: teamServer.displayName ?? 'You',
                    });
                    // Fire-and-forget push — non-blocking
                    sync.pushFrame({
                      id: Date.now(),
                      gop_id: sessionId ?? 'unknown',
                      t: 0,
                      frame_type: 'I',
                      base_frame_id: null,
                      content: typeof result === 'string' ? result.slice(0, 500) : '',
                      importance: 'normal',
                      source: 'agent_inferred',
                      access_count: 0,
                      created_at: new Date().toISOString(),
                      last_accessed: new Date().toISOString(),
                    }).catch(err => console.warn('[waggle] TeamSync push failed:', err.message));
                  }
                } catch { /* TeamSync not available */ }
              }
            }
          },
        };

        // Run the agent loop
        const result = await agentRunner(agentConfig);

        // Unregister the per-request approval hook
        if (unregisterHook) unregisterHook();

        // Track cost (same as CLI) — include workspace for per-workspace breakdown
        costTracker.addUsage(resolvedModel, result.usage.inputTokens, result.usage.outputTokens, effectiveWorkspace);

        // ── Post-response memory write-back ──────────────────────
        // If the agent didn't save memory itself, check if the exchange
        // contains save-worthy content and auto-save it.
        if (!hasCustomRunner) {
          const agentAlreadySaved = (result.toolsUsed ?? []).includes('save_memory');
          if (!agentAlreadySaved) {
            try {
              const saved = await orchestrator.autoSaveFromExchange(message, result.content);
              if (saved.length > 0) {
                sendEvent('step', { content: `Auto-saved ${saved.length} memor${saved.length === 1 ? 'y' : 'ies'} from this exchange.` });
              }
            } catch {
              // Non-blocking
            }
          }
        }

        // ── KG auto-extraction (Item 4) ────────────────────────────
        // Extract named entities from the agent response and add them to the
        // knowledge graph of the active workspace mind.
        // Non-blocking — KG enrichment never fails the response.
        if (!hasCustomRunner && result.content && result.content.length > 100) {
          try {
            const knowledge = orchestrator.getKnowledge();
            const entities = extractEntities(result.content);
            if (entities.length > 0) {
              const now = new Date().toISOString();
              // Cap at 10 entities per turn to avoid KG bloat
              for (const entity of entities.slice(0, 10)) {
                try {
                  knowledge.createEntity(entity.type, entity.name, { confidence: entity.confidence, source: `session:${sessionId}` }, { valid_from: now });
                } catch {
                  // Duplicate or schema error — skip silently
                }
              }
            }
          } catch (e) {
            console.log('[waggle] KG extraction error:', e instanceof Error ? e.message : String(e));
          }
        }

        // ── Correction detection ──────────────────────────────────
        // Analyze user message for corrections and record improvement signals.
        // Non-blocking — detection failure shouldn't affect the response.
        if (!hasCustomRunner) {
          try {
            const signalStore = orchestrator.getImprovementSignals();
            analyzeAndRecordCorrection(signalStore, message);

            // Record capability gaps from tool-not-found events
            const toolNotFoundPattern = /Tool "(.+?)" not found/;
            if (result.content) {
              const match = result.content.match(toolNotFoundPattern);
              if (match) {
                recordCapabilityGap(signalStore, match[1]);
              }
            }
          } catch {
            // Non-blocking
          }
        }

        // Post-processing: enforce professional disclaimer for regulated personas
        let finalContent = result.content;
        const REGULATED_DISCLAIMER_MAP: Record<string, string> = {
          'hr-manager': '\n\n---\n*This is general HR guidance, not legal advice. Consult your legal team for binding decisions.*',
          'legal-professional': '\n\n---\n*This is AI-assisted legal analysis, not legal advice. This does not create an attorney-client relationship. Consult a licensed attorney for binding legal guidance.*',
          'finance-owner': '\n\n---\n*Financial figures are estimates based on available data. Verify with your accountant or financial advisor before making decisions.*',
        };
        if (activePersonaId && REGULATED_DISCLAIMER_MAP[activePersonaId] && finalContent) {
          const hasDisclaimer = finalContent.toLowerCase().includes('not legal advice') ||
            finalContent.toLowerCase().includes('attorney-client') ||
            finalContent.toLowerCase().includes('verify with your accountant') ||
            finalContent.toLowerCase().includes('financial advisor') ||
            finalContent.toLowerCase().includes('legal team');
          if (!hasDisclaimer) {
            finalContent += REGULATED_DISCLAIMER_MAP[activePersonaId];
          }
        }

        // IMP-004: Contextual cron suggestion — nudge user about /schedule when response discusses recurring work
        if (!hasCustomRunner && finalContent && shouldSuggestSchedule(finalContent, result.toolsUsed ?? [])) {
          finalContent += SCHEDULE_SUGGESTION;
        }

        // Add assistant response to history (maintains context for next turn) and persist
        history.push({ role: 'assistant', content: finalContent });
        persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: finalContent });

        // Send the done event with full response + model info + per-message cost
        const messageCost = result.usage
          ? costTracker.calculateCost(result.usage.inputTokens, result.usage.outputTokens, resolvedModel)
          : undefined;
        sendEvent('done', {
          content: finalContent,
          usage: result.usage,
          toolsUsed: result.toolsUsed,
          model: resolvedModel,
          ...(messageCost !== undefined && {
            cost: Math.round(messageCost * 1_000_000) / 1_000_000,
            tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
          }),
        });

        emitNotification(server, {
          title: 'Agent finished',
          body: 'Your agent has completed the task',
          category: 'agent',
        });
      }
    } catch (err) {
      // Send user-friendly error event — never show raw traces
      let errorMessage: string;
      if (err instanceof Error) {
        // Clean up common error messages for the user
        if (err.message.includes('ECONNREFUSED')) {
          errorMessage = 'Could not reach the AI model. Check that your API key is configured in Settings.';
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          errorMessage = 'API key is invalid or expired. Update it in Settings > API Keys.';
        } else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
          errorMessage = 'The request timed out. The model may be overloaded — try again in a moment.';
        } else if (err.message.includes('context_length') || err.message.includes('too many tokens')) {
          errorMessage = 'The conversation is too long for the model. Try clearing the chat and starting fresh.';
        } else {
          errorMessage = err.message;
        }
      } else {
        errorMessage = 'Something went wrong. Try sending your message again.';
      }
      // P1-4: When auto_recall succeeded but LLM failed, surface recalled memories
      // P1-4: recalledContext is now declared at outer scope
      const recalled = recalledContext;
      if (recalled && recalled.trim().length > 0) {
        const memoryFallback = `${errorMessage}\n\n---\n\n**However, I found relevant context in memory:**\n${recalled}`;
        sendEvent('error', { message: memoryFallback });
      } else {
        sendEvent('error', { message: errorMessage });
      }
    }

    // End the SSE stream
    raw.end();
  });

  // DELETE /api/chat/history — clear session history
  server.delete<{
    Querystring: { session?: string };
  }>('/api/chat/history', async (request, reply) => {
    const sessionId = request.query.session ?? 'default';
    sessionHistories.delete(sessionId);
    return reply.send({ ok: true, cleared: sessionId });
  });
};

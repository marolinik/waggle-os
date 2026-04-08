/**
 * chat-context.ts — Context window management for the chat route.
 *
 * Extracted from chat.ts to keep files under 800 LOC.
 * Pure functions with no server state dependencies.
 */

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
export function summarizeDroppedContext(messages: Array<{ role: string; content: string }>): string {
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

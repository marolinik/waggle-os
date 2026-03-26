/**
 * Skill Creator — generate SKILL.md files from structured templates.
 *
 * Provides utilities to:
 * 1. Generate valid SKILL.md markdown from a SkillTemplate
 * 2. Detect repeatable workflow patterns from session history
 *
 * Used by the `create_skill` agent tool and the proactive workflow capture system.
 */

export interface SkillTemplate {
  name: string;
  description: string;
  triggerPatterns: string[];
  steps: string[];
  tools: string[];
  category: string;
}

/**
 * Generate a SKILL.md file from a structured template.
 *
 * Produces valid SKILL.md with YAML frontmatter (compatible with
 * validateSkillMd in @waggle/sdk and parseSkillFrontmatter in @waggle/agent).
 */
export function generateSkillMarkdown(template: SkillTemplate): string {
  const kebabName = template.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const triggers = template.triggerPatterns.length > 0
    ? template.triggerPatterns.join(', ')
    : kebabName;

  let md = `---\n`;
  md += `name: ${kebabName}\n`;
  md += `description: ${template.description}\n`;
  md += `---\n\n`;
  md += `# ${template.name}\n\n`;
  md += `${template.description}\n\n`;

  if (template.triggerPatterns.length > 0) {
    md += `## Trigger Patterns\n\n`;
    md += `Activate this skill when the user asks about: ${triggers}\n\n`;
  }

  md += `## Steps\n\n`;
  md += template.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  md += '\n\n';

  if (template.tools.length > 0) {
    md += `## Tools Used\n\n`;
    md += template.tools.map(t => `- ${t}`).join('\n');
    md += '\n\n';
  }

  md += `## Category\n\n`;
  md += `${template.category}\n`;

  return md;
}

/**
 * Extract tool sequences from a list of messages.
 * Looks at toolsUsed arrays and collects ordered tool names.
 */
function extractToolSequence(
  messages: Array<{ role: string; content: string; toolsUsed?: string[] }>,
): string[] {
  const tools: string[] = [];
  for (const msg of messages) {
    if (msg.toolsUsed && msg.toolsUsed.length > 0) {
      tools.push(...msg.toolsUsed);
    }
  }
  return tools;
}

/**
 * Find the longest common subsequence between two tool sequences.
 * Returns the length of the common ordered subsequence.
 */
function longestCommonSubsequenceLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  // Optimized: only need two rows
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n];
}

/**
 * Compute similarity between two tool sequences using LCS ratio.
 * Returns a value between 0 and 1.
 */
function toolSequenceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const lcsLen = longestCommonSubsequenceLength(a, b);
  return lcsLen / Math.max(a.length, b.length);
}

/**
 * Analyze session history to detect repeatable workflow patterns.
 *
 * Looks for:
 * - Repeated tool sequences (same 3+ tools in same order)
 * - Common prompt patterns (user asks similar things)
 *
 * Returns a SkillTemplate if a strong pattern is found, null otherwise.
 */
export function detectWorkflowPattern(
  messages: Array<{ role: string; content: string; toolsUsed?: string[] }>,
): SkillTemplate | null {
  // Need at least 6 messages (3 user + 3 assistant with tools) to detect a pattern
  if (messages.length < 6) return null;

  const toolSeq = extractToolSequence(messages);

  // Need at least 3 tools to form a meaningful pattern
  if (toolSeq.length < 3) return null;

  // Look for repeated subsequences within the session.
  // Split tool sequence into potential "workflow chunks" by finding repeated groups.
  // A simple approach: look for the same tool appearing at regular intervals,
  // indicating a repeated workflow.

  // Count tool co-occurrences to find clusters
  const toolCounts = new Map<string, number>();
  for (const tool of toolSeq) {
    toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
  }

  // Tools used 2+ times suggest repetition
  const repeatedTools = [...toolCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([tool]) => tool);

  if (repeatedTools.length < 2) return null;

  // Find the most common ordered subsequence of 3+ tools
  // Try sliding windows of increasing size
  const windowSizes = [3, 4, 5];
  let bestPattern: string[] | null = null;
  let bestCount = 0;

  for (const windowSize of windowSizes) {
    if (toolSeq.length < windowSize * 2) continue;

    const windowCounts = new Map<string, { tools: string[]; count: number }>();

    for (let i = 0; i <= toolSeq.length - windowSize; i++) {
      const window = toolSeq.slice(i, i + windowSize);
      const key = window.join('|');

      if (windowCounts.has(key)) {
        windowCounts.get(key)!.count++;
      } else {
        windowCounts.set(key, { tools: window, count: 1 });
      }
    }

    for (const [, entry] of windowCounts) {
      if (entry.count >= 2 && entry.count > bestCount) {
        bestCount = entry.count;
        bestPattern = entry.tools;
      }
    }
  }

  if (!bestPattern || bestCount < 2) return null;

  // Extract user messages to guess the workflow purpose
  const userMessages = messages
    .filter(m => m.role === 'user' && m.content)
    .map(m => m.content);

  // Generate a name from the tool pattern
  const patternName = bestPattern
    .map(t => t.replace(/_/g, '-'))
    .slice(0, 3)
    .join('-then-');

  // Infer description from the tools used
  const description = `Automated workflow: ${bestPattern.join(' -> ')}. Detected from repeated usage pattern.`;

  return {
    name: patternName,
    description,
    triggerPatterns: userMessages.slice(0, 3).map(m =>
      m.length > 80 ? m.slice(0, 80) + '...' : m,
    ),
    steps: bestPattern.map((tool, i) =>
      `Step ${i + 1}: Use ${tool}`,
    ),
    tools: [...new Set(bestPattern)],
    category: inferCategory(bestPattern),
  };
}

/**
 * Infer a category from tool names.
 */
function inferCategory(tools: string[]): string {
  const toolStr = tools.join(' ').toLowerCase();

  if (toolStr.includes('web_search') || toolStr.includes('web_fetch')) return 'research';
  if (toolStr.includes('git_') || toolStr.includes('code') || toolStr.includes('edit_file')) return 'coding';
  if (toolStr.includes('memory') || toolStr.includes('save_memory') || toolStr.includes('search_memory')) return 'knowledge';
  if (toolStr.includes('draft') || toolStr.includes('write') || toolStr.includes('generate_docx')) return 'writing';
  if (toolStr.includes('plan') || toolStr.includes('task')) return 'planning';
  if (toolStr.includes('search')) return 'research';

  return 'general';
}

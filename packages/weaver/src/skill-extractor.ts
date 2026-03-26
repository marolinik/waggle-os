export interface SessionEntry {
  role: string;
  content: string;
  tools_used?: string[];
}

export interface ExtractedSkill {
  name: string;
  description: string;
  tools: string[];
  frequency: number;
}

export function extractSessionSkills(entries: SessionEntry[]): ExtractedSkill[] {
  // Group user→agent pairs by tool combo key
  const toolCombos = new Map<string, { tools: string[]; count: number; prompts: string[] }>();

  for (let i = 0; i < entries.length - 1; i++) {
    const user = entries[i];
    const agent = entries[i + 1];
    if (user.role !== 'user' || agent.role !== 'agent') continue;
    if (!agent.tools_used || agent.tools_used.length === 0) continue;

    const key = [...agent.tools_used].sort().join('+');
    const existing = toolCombos.get(key);
    if (existing) {
      existing.count++;
      existing.prompts.push(user.content);
    } else {
      toolCombos.set(key, { tools: agent.tools_used, count: 1, prompts: [user.content] });
    }
  }

  // Return patterns with frequency >= 2, or multi-tool at frequency 1
  const skills: ExtractedSkill[] = [];
  for (const [, combo] of toolCombos) {
    if (combo.count >= 2 || combo.tools.length >= 2) {
      skills.push({
        name: combo.tools.sort().join('+'),
        description: `Pattern: ${combo.prompts[0]}`,
        tools: combo.tools,
        frequency: combo.count,
      });
    }
  }

  return skills;
}

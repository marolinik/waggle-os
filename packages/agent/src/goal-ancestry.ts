/**
 * AI-OS #6 — pure renderer for the goal-ancestry "# Why You're Here" prompt
 * section. Total (never throws); returns '' when there is no durable "why" so
 * the section self-suppresses and the prompt stays byte-identical to today.
 */
import type { GoalAncestry } from '@waggle/shared';

const MAX = 200;
const cap = (s: string): string => (s.length > MAX ? s.slice(0, MAX - 3) + '...' : s);

export function renderGoalAncestry(a: GoalAncestry | null | undefined): string {
  if (!a) return '';
  const lines: string[] = [];
  if (a.mission) lines.push(`Mission: ${cap(a.mission)}`);
  if (a.project) lines.push(`Project: ${cap(a.project)}`);
  if (a.goal) lines.push(`Goal: ${cap(a.goal)}`);
  if (a.task) lines.push(`Task: ${cap(a.task)}`);
  if (lines.length === 0) return '';
  return "# Why You're Here\n" + lines.join('\n');
}

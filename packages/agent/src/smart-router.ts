/**
 * Smart Model Router — heuristic classifier for budget model routing.
 */

export interface RoutingDecision {
  model: string;
  reason: 'simple_turn' | 'normal';
}

const COMPLEX_KEYWORDS = /\b(debug|error|fix|refactor|implement|architect|design|analyze|review|migrate|deploy|build|test|create|generate|write|develop|configure|setup|install)\b/i;

export function routeMessage(
  message: string,
  primaryModel: string,
  budgetModel: string | null,
): RoutingDecision {
  if (!budgetModel) return { model: primaryModel, reason: 'normal' };
  if (message.length > 500) return { model: primaryModel, reason: 'normal' };
  if (message.split(/\s+/).filter(Boolean).length > 80) return { model: primaryModel, reason: 'normal' };
  if (message.includes('```') || message.includes('`')) return { model: primaryModel, reason: 'normal' };
  if (/https?:\/\//.test(message)) return { model: primaryModel, reason: 'normal' };
  if ((message.match(/\n/g) || []).length >= 3) return { model: primaryModel, reason: 'normal' };
  if (COMPLEX_KEYWORDS.test(message)) return { model: primaryModel, reason: 'normal' };
  return { model: budgetModel, reason: 'simple_turn' };
}

/**
 * Smart Model Router - conservative classifier for budget model routing.
 *
 * A false primary route costs a little more. A false budget route can produce a
 * materially worse answer or send sensitive work to a differently configured
 * provider. Consequently, only a closed set of bounded, low-risk turns is sent
 * to the budget model; everything else stays on the user's primary model.
 */

export interface RoutingDecision {
  model: string;
  reason: 'simple_turn' | 'normal';
}

const PRIMARY_ROUTE_SIGNALS = [
  // Legal, regulatory, payroll, and employment decisions.
  /\b(?:legal|lawful|lawyer|attorney|court|lawsuit|litigat\w*|contract(?:ual)?|clause|indemnit\w*|liabilit\w*|compliance|regulat\w*|statute|jurisdiction|enforceab\w*|non[- ]?compete|nda|gdpr|hipaa|copyright|patent|trademark|subpoena|settlement)\b/i,
  /\b(?:payroll|pay[- ]?slip|paycheck|salary|wages?|overtime|withholding|tax(?:es)?|bonus|compensation|severance|benefits?|pension|employee|contractor|worker classification|deductions?|net pay|gross pay|filing)\b/i,

  // Irreversible actions or actions with an external side effect.
  /\b(?:delete|remove|erase|drop|truncate|wipe|purge|destroy|overwrite|force[- ]?push|revoke|rotate|terminate|disable|shut ?down|kill|merge|commit|push|deploy|publish|send|email|submit|upload|transfer|purchase|execute|run|apply|production|database|repo(?:sitory)?|branches?)\b/i,

  // Verification, coding, research, and other deliberative work.
  /\b(?:verify|validate|proof|prove|audit|double[- ]?check|fact[- ]?check|cross[- ]?check|reconcile|checksum|signed|evidence|trace|artifact)\b/i,
  /\b(?:debug|errors?|fix|refactor|implement|architect|design|analy[sz]e|review|migrate|build|tests?|create|generate|write|develop|configure|setup|install|code|function|class|module|api|sdk|bugs?|stack trace|exception|compiler|runtime|typescript|javascript|python|rust|sql|regex|git|docker|kubernetes|promise|async|race condition|null pointer|query|endpoint|dependency|schema|pull request)\b/i,
  /\b(?:research|sources?|citations?|cite|peer[- ]reviewed|compare|evaluate|assess|investigate|synthesi[sz]e|literature|stud(?:y|ies)|benchmark|forecast|latest|recent|news|guidance|nist)\b/i,

  // Secrets, personal data, health data, and prompt-control attempts.
  /\b(?:confidential|private|sensitive|secret|credentials?|password|passcode|tokens?|api key|pii|ssn|social security|medical|diagnos\w*|health|patient|personal data|customer data|bank account|credit card|passport|identity|performance notes)\b/i,
  /\b(?:ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer message|jailbreak)\b/i,
] as const;

const TRIVIAL_TURN_PATTERNS = [
  /^(?:hi|hello|hey|good (?:morning|afternoon|evening))(?:\s+(?:there|everyone|team|all))?[!,.?]*$/i,
  /^(?:thanks|thank you|got it|okay|ok|sounds good|understood|you're welcome)[!,.?]*$/i,
  /^(?:what'?s the (?:current )?time|what time is it)(?:\s+(?:now|in [\p{L}\p{M} .'-]+))?[?!.]*$/iu,
  /^(?:what'?s today'?s date|what is today'?s date|what date is it|what day is it(?: today)?)[?!.]*$/iu,
  /^(?:please\s+)?translate\s+(?:"[^"\r\n]{1,120}"|'[^'\r\n]{1,120}'|[\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+){0,3})\s+(?:in)?to\s+[\p{L}\p{M}-]+(?:\s+please)?[?!.]*$/iu,
  /^(?:(?:what'?s|what is|calculate|compute)\s+)?[-+]?[\d,.]+(?:\s*(?:\+|-|\*|\/|%|mod|\^)\s*[-+]?[\d,.]+)+(?:\s*=\s*)?[?!.]*$/iu,
  /^(?:please\s+)?convert\s+[-+]?\d+(?:[.,]\d+)?\s+[\p{L}\p{M}/%]+\s+(?:in)?to\s+[\p{L}\p{M}/%]+[?!.]*$/iu,
  /^(?:how do you spell|spell)\s+[\p{L}\p{M}'-]+[?!.]*$/iu,
  /^what'?s the capital of [\p{L}\p{M} .'-]+[?!.]*$/iu,
  /^what is the capital of [\p{L}\p{M} .'-]+[?!.]*$/iu,
  /^(?:define\s+[\p{L}\p{M}'-]+|what does\s+[\p{L}\p{M}'-]+\s+mean)[?!.]*$/iu,
] as const;

export function routeMessage(
  message: string,
  primaryModel: string,
  budgetModel: string | null,
): RoutingDecision {
  if (!budgetModel) return { model: primaryModel, reason: 'normal' };

  const normalized = message.trim();
  if (!normalized || message.length > 500) return { model: primaryModel, reason: 'normal' };
  if (normalized.split(/\s+/).length > 80) return { model: primaryModel, reason: 'normal' };
  if (message.includes('`')) return { model: primaryModel, reason: 'normal' };
  if (/https?:\/\//i.test(message)) return { model: primaryModel, reason: 'normal' };
  if ((message.match(/\n/g) || []).length >= 3) return { model: primaryModel, reason: 'normal' };
  if (PRIMARY_ROUTE_SIGNALS.some(pattern => pattern.test(normalized))) {
    return { model: primaryModel, reason: 'normal' };
  }
  if (TRIVIAL_TURN_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { model: budgetModel, reason: 'simple_turn' };
  }
  return { model: primaryModel, reason: 'normal' };
}

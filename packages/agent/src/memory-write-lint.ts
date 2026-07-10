/**
 * Memory-Write Lint — "fix the source, not the symptom".
 *
 * A deterministic (regex/heuristic, NO LLM) classifier that flags memory writes
 * which merely record a capability failure symptom — e.g. "the Slack connector
 * failed to authenticate" or "the web search tool keeps timing out". Memorizing
 * such a symptom is the wrong response: the agent should fix or flag the
 * capability (acquire_capability) instead of durably remembering that it is
 * broken, which rots the moment the capability is repaired.
 *
 * Design constraints:
 * - Conservative by default. Memory loss is worse than one extra nag, so any
 *   ambiguity resolves to `allow`.
 * - User preferences / opinions about tools ("user prefers Slack over email")
 *   MUST pass — they reference a capability but carry no failure signal.
 * - Detection is sentence-scoped: a capability noun and a failure verb must
 *   co-occur in the SAME sentence, so an unrelated "cannot" three sentences away
 *   from an unrelated "tool" does not trip the classifier.
 */

export type MemoryLintVerdict = 'allow' | 'capability_symptom';

export interface MemoryLintResult {
  verdict: MemoryLintVerdict;
  /** Best-effort name of the capability the symptom is about (feeds recordCapabilityGap). */
  capability?: string;
  /** Human-readable reason (the offending sentence), for the cancel message / log. */
  reason?: string;
}

// A generic reference to an acquirable capability. Named services (Slack, Jira)
// are intentionally NOT listed — relying on generic nouns keeps the classifier
// conservative and avoids false positives like "the Slack meeting failed".
const CAPABILITY_NOUN =
  /\b(tools?|skills?|connectors?|capabilit(?:y|ies)|integrations?|plugins?|mcp\s+servers?|apis?|connection)\b/i;

// Failure verbs / phrases. A bare "cannot" / "can't" is NOT a failure signal on
// its own — it also fronts preferences ("cannot stand Sketch") and dependence
// ("can't work without Jira"), neither of which is a broken capability. It fires
// only when directly followed by a capability verb (connect/authenticate/…), so
// "cannot launch" trips but "cannot stand" / "can't work without" do not.
const FAILURE_VERB = new RegExp(
  [
    /\bfail(?:ed|ing|s)?\b/.source,
    /\b(?:does\s*n['’]?t|do\s*n['’]?t|did\s*n['’]?t|does\s+not|do\s+not|did\s+not)\s+work\b/.source,
    /\b(?:is|are|was|were|are\s*n['’]?t|is\s*n['’]?t|not)\s+working\b/.source,
    /\b(?:un)?available\b/.source,
    /\bnot\s+available\b/.source,
    /\bno\s+longer\s+available\b/.source,
    /\berrors?\s+(?:out|when)\b/.source,
    /\b(?:return|throw|give|gave|got|threw|returns|throws|gives|returning|throwing)\s+(?:an?\s+)?errors?\b/.source,
    /\b(?:ca\s*n['’]?t|can\s*not|cannot|could\s*n['’]?t|could\s*not|unable\s+to)\s+(?:connect|authenticate|access|load|run|execute|reach|find|install|launch|open|start|respond|refresh|sync|fetch|retrieve|send|log\s*in|sign\s*in|complete|initiali[sz]e|render|save|read|write|be\s+reached|be\s+found)\b/.source,
    /\bbroken\b/.source,
    /\b(?:keeps?\s+)?(?:tim(?:e|ing)s?\s+out|timed\s+out|timing\s+out)\b/.source,
    // Planned downtime ("down for maintenance") is a status fact, not a broken
    // capability — the lookahead lets it pass while "is down" still fires.
    /\bis\s+down\b(?!\s+for\s+maintenance)/.source,
    /\bnot\s+responding\b/.source,
  ].join('|'),
  'i',
);

// A connection failure implies an integration/capability on its own, even
// without a generic capability noun in the sentence.
const CONNECTION_FAILURE =
  /\b(?:failed\s+to\s+connect|ca\s*n['’]?t\s+connect|cannot\s+connect|could\s*n['’]?t\s+connect|unable\s+to\s+connect|wo\s*n['’]?t\s+connect|not\s+connecting)\b/i;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'our', 'your',
  'its', 'their', 'his', 'her', 'to', 'of', 'and', 'or', 'with', 'using',
]);

/**
 * Extract a best-effort capability name from an offending sentence: up to two
 * meaningful words preceding the capability noun (e.g. "web search tool"), or
 * the target of a "connect to X" phrase, falling back to the generic noun.
 */
function extractCapability(sentence: string): string {
  const nounMatch = sentence.match(
    /((?:[\w.-]+\s+){0,2})(tools?|skills?|connectors?|capabilit(?:y|ies)|integrations?|plugins?|mcp\s+servers?|apis?|connection)\b/i,
  );
  if (nounMatch) {
    const prefixWords = nounMatch[1]
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0 && !STOPWORDS.has(w.toLowerCase()));
    const noun = nounMatch[2].trim();
    const phrase = [...prefixWords, noun].join(' ').trim();
    return phrase || noun;
  }

  const connectMatch = sentence.match(/connect(?:ing)?\s+to\s+(?:the\s+)?([\w-]+)/i);
  if (connectMatch) return connectMatch[1];

  return 'capability';
}

function classifySentence(sentence: string): MemoryLintResult | null {
  const hasConnectionFailure = CONNECTION_FAILURE.test(sentence);
  const hasCapabilityNoun = CAPABILITY_NOUN.test(sentence);
  const hasFailureVerb = FAILURE_VERB.test(sentence);

  if (hasConnectionFailure || (hasCapabilityNoun && hasFailureVerb)) {
    return {
      verdict: 'capability_symptom',
      capability: extractCapability(sentence),
      reason: sentence.trim(),
    };
  }
  return null;
}

/**
 * Lint a proposed memory write. Returns `capability_symptom` only when a single
 * sentence pairs a capability reference with a failure signal; everything else
 * (including tool preferences and unrelated capability mentions) is `allow`.
 *
 * @param content The memory content the agent wants to save.
 * @param _type   The memory type, if any. Unused today (the save_memory hook
 *                does not carry a semantic type) but accepted per the contract.
 */
export function lintMemoryWrite(content: string, _type?: string): MemoryLintResult {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return { verdict: 'allow' };
  }

  // Sentence-scope the check so a capability noun and a failure verb in
  // unrelated sentences do not combine into a false positive.
  const sentences = content.split(/(?<=[.!?\n])|[\n]/);
  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    const result = classifySentence(sentence);
    if (result) return result;
  }

  return { verdict: 'allow' };
}

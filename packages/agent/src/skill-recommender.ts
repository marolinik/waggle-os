/**
 * Contextual skill recommendation engine.
 *
 * Matches installed skills to conversation context via semantic similarity,
 * enabling the agent to proactively suggest relevant skills.
 *
 * Uses a multi-signal scoring approach:
 *   1. Exact keyword matching (name + content)
 *   2. Bigram overlap for phrase-level matching
 *   3. Synonym/alias expansion for semantic reach
 *      (e.g., "code review" -> "architectural-review-companion")
 */

export interface SkillRecommendation {
  skillName: string;
  reason: string;
  relevanceScore: number; // 0-1
}

export interface SkillRecommenderDeps {
  /** Function to get current installed skills (name + content) */
  getSkills: () => Array<{ name: string; content: string }>;
  /** Currently active skill names (to filter out) */
  activeSkills?: string[];
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'for', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'to', 'of', 'in', 'on', 'at', 'by', 'with',
  'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'this', 'that', 'these', 'those', 'it',
  'its', 'my', 'your', 'our', 'their', 'what', 'which', 'who', 'whom',
  'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'some', 'any', 'no', 'just', 'very', 'also', 'than', 'then',
]);

/**
 * Synonym clusters for semantic matching.
 * Each cluster groups terms that should be treated as equivalent
 * when scoring skill relevance.
 */
const SYNONYM_CLUSTERS: string[][] = [
  ['review', 'audit', 'inspect', 'examine', 'check', 'assess', 'evaluate', 'critique'],
  ['code', 'programming', 'software', 'engineering', 'development', 'coding', 'architectural'],
  ['write', 'draft', 'compose', 'create', 'author', 'document', 'memo', 'writing'],
  ['research', 'investigate', 'explore', 'study', 'analyze', 'analysis', 'synthesis'],
  ['plan', 'organize', 'schedule', 'roadmap', 'strategy', 'planning', 'breakdown'],
  ['decide', 'decision', 'choose', 'compare', 'evaluate', 'matrix', 'tradeoff'],
  ['risk', 'threat', 'vulnerability', 'hazard', 'danger', 'assessment'],
  ['meeting', 'standup', 'sync', 'catchup', 'catch-up', 'status', 'update'],
  ['brainstorm', 'ideate', 'creative', 'ideation', 'innovate', 'ideas'],
  ['task', 'todo', 'action', 'item', 'work', 'assignment', 'daily'],
  ['team', 'collaborate', 'pair', 'group', 'swarm', 'multi-agent'],
  ['explain', 'concept', 'teach', 'describe', 'clarify', 'understand'],
  ['retrospective', 'retro', 'postmortem', 'lessons', 'reflection'],
];

/** Build a map from each word to the set of words it's synonymous with. */
function buildSynonymMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const cluster of SYNONYM_CLUSTERS) {
    const clusterSet = new Set(cluster);
    for (const word of cluster) {
      const existing = map.get(word);
      if (existing) {
        for (const w of clusterSet) existing.add(w);
      } else {
        map.set(word, new Set(clusterSet));
      }
    }
  }
  return map;
}

const SYNONYM_MAP = buildSynonymMap();

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/** Extract bigrams from a list of words for phrase-level matching. */
function extractBigrams(words: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

/** Expand a keyword into its synonym set (including itself). */
function expandWithSynonyms(keyword: string): string[] {
  const synonyms = SYNONYM_MAP.get(keyword);
  if (!synonyms) return [keyword];
  return [...synonyms];
}

/**
 * Build a term frequency map for a text (TF component).
 * Splits on whitespace and non-alpha, normalizes to lowercase.
 */
function buildTermFrequency(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  const words = text.toLowerCase().split(/[\s\-_.,;:!?()[\]{}'"]+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  for (const w of words) {
    tf.set(w, (tf.get(w) ?? 0) + 1);
  }
  return tf;
}

export class SkillRecommender {
  constructor(private deps: SkillRecommenderDeps) {}

  /**
   * Given conversation context (user's recent message or topic),
   * return top-N skill recommendations ranked by relevance.
   *
   * Scoring uses multiple signals:
   *   - Exact keyword match in name (3x weight)
   *   - Synonym match in name (2x weight)
   *   - Exact keyword match in content (1x weight)
   *   - Synonym match in content (0.7x weight)
   *   - Bigram overlap bonus (0.5x per bigram match)
   *   - TF-IDF inspired weighting (rare terms in corpus score higher)
   */
  recommend(context: string, topN: number = 3): SkillRecommendation[] {
    if (!context || !context.trim()) return [];

    const keywords = extractKeywords(context);
    if (keywords.length === 0) return [];

    const bigrams = extractBigrams(keywords);

    const skills = this.deps.getSkills();
    const activeSet = new Set(this.deps.activeSkills ?? []);

    // Build document frequency for IDF-like weighting
    const docFreq = new Map<string, number>();
    for (const skill of skills) {
      const tf = buildTermFrequency(skill.name + ' ' + skill.content);
      for (const term of tf.keys()) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }
    const totalDocs = Math.max(skills.length, 1);

    const scored: SkillRecommendation[] = [];

    for (const skill of skills) {
      if (activeSet.has(skill.name)) continue;

      const nameLower = skill.name.toLowerCase().replace(/-/g, ' ');
      const nameWords = extractKeywords(skill.name);
      const contentTf = buildTermFrequency(skill.content);
      const combinedText = nameLower + ' ' + skill.content.toLowerCase();

      let weightedScore = 0;
      const matchedInName: string[] = [];
      const matchedInContent: string[] = [];
      const matchedViaSynonym: string[] = [];

      for (const kw of keywords) {
        // IDF weight: rarer terms across all skills score higher
        const df = docFreq.get(kw) ?? 0;
        const idfWeight = df > 0 ? Math.log(totalDocs / df) + 1 : 1;

        // Direct match in name
        if (nameLower.includes(kw) || nameWords.includes(kw)) {
          weightedScore += 3 * idfWeight;
          matchedInName.push(kw);
          continue;
        }

        // Synonym match in name
        const synonyms = expandWithSynonyms(kw);
        let synonymMatchedInName = false;
        for (const syn of synonyms) {
          if (syn !== kw && (nameLower.includes(syn) || nameWords.includes(syn))) {
            weightedScore += 2 * idfWeight;
            matchedViaSynonym.push(`${kw}~${syn}`);
            synonymMatchedInName = true;
            break;
          }
        }
        if (synonymMatchedInName) continue;

        // Direct match in content
        if (contentTf.has(kw)) {
          // Weight by term frequency in the skill (capped at 3)
          const tfBoost = Math.min(contentTf.get(kw)!, 3);
          weightedScore += 1 * idfWeight * (1 + tfBoost * 0.1);
          matchedInContent.push(kw);
          continue;
        }

        // Synonym match in content
        for (const syn of synonyms) {
          if (syn !== kw && contentTf.has(syn)) {
            weightedScore += 0.7 * idfWeight;
            matchedViaSynonym.push(`${kw}~${syn}`);
            break;
          }
        }
      }

      // Bigram overlap bonus (phrase-level matching)
      if (bigrams.length > 0) {
        for (const bigram of bigrams) {
          if (combinedText.includes(bigram)) {
            weightedScore += 0.5;
          }
        }
      }

      if (weightedScore === 0) continue;

      // Normalize score to 0-1 range
      const maxPossible = keywords.length * 3; // all keywords matched in name at max weight
      const score = Math.min(weightedScore / maxPossible, 1.0);
      if (score < 0.05) continue;

      // Build reason string
      let reason: string;
      if (matchedInName.length > 0 && matchedViaSynonym.length > 0) {
        reason = `Skill name matches: "${matchedInName.join('", "')}" + related: ${matchedViaSynonym.map(s => s.split('~')[1]).join(', ')}`;
      } else if (matchedInName.length > 0) {
        reason = `Skill name matches your topic: "${matchedInName.join('", "')}"`;
      } else if (matchedViaSynonym.length > 0) {
        reason = `Related to your query via: ${matchedViaSynonym.map(s => `"${s.split('~')[0]}" (matches "${s.split('~')[1]}")`).join(', ')}`;
      } else {
        reason = `Skill content mentions: "${matchedInContent.join('", "')}"`;
      }

      scored.push({
        skillName: skill.name,
        reason,
        relevanceScore: Math.round(score * 1000) / 1000, // 3 decimal places
      });
    }

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, topN);
  }
}

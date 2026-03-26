export interface ExtractedEntity {
  name: string;
  type: 'person' | 'project' | 'technology' | 'organization' | 'tool' | 'concept';
  confidence: number;
}

const TECH_TERMS = new Set([
  'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'ruby',
  'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
  'node', 'nodejs', 'deno', 'bun',
  'postgresql', 'postgres', 'sqlite', 'mysql', 'mongodb', 'redis', 'qdrant',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure',
  'git', 'github', 'gitlab',
  'fastify', 'express', 'flask', 'django',
  'tauri', 'electron',
  'graphql', 'rest', 'grpc',
  'openai', 'anthropic', 'litellm', 'claude', 'gpt',
  'vitest', 'jest', 'pytest',
  'drizzle', 'prisma', 'sequelize',
  'bullmq', 'clerk', 'stripe',
  'webpack', 'vite', 'esbuild', 'rollup',
]);

const PROPER_NOUN_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
const SKIP_WORDS = new Set(['The', 'This', 'That', 'These', 'What', 'When', 'Where', 'Which', 'Who', 'How', 'Why', 'And', 'But', 'For', 'Not', 'You', 'Your', 'They', 'Has', 'Have', 'Was', 'Were', 'Are', 'Will', 'Would', 'Could', 'Should', 'Can', 'May', 'Let', 'Use', 'Set', 'Get', 'Run', 'Add', 'See', 'Also', 'Just', 'Now', 'Here', 'Then', 'All', 'Any', 'Each', 'Some', 'Yes', 'Hi', 'Hey', 'Thanks', 'Please', 'Sorry', 'Sure', 'Switch', 'Error']);

// F3: Classification heuristics for multi-word proper nouns
const CONCEPT_INDICATORS = /\b(analysis|assessment|review|strategy|planning|framework|methodology|approach|decision|pattern|principle|design|optimization|evaluation|implementation|migration|integration|configuration|architecture|pipeline|workflow|summary|overview|comparison|benchmark|audit|standard|guideline|requirement|specification|matrix|model|protocol|phase|milestone|roadmap)\b/i;
const ORG_INDICATORS = /\b(inc|corp|ltd|llc|gmbh|group|company|foundation|institute|university|team|department|ministry|agency|council|board|association|partnership|venture|capital|labs?|studio|consulting)\b/i;
const PROJECT_INDICATORS = /^(project|initiative|program|campaign|operation|mission|sprint|milestone|phase|version)\b/i;

// L7: Person name heuristics — common first names help disambiguate from concepts
const PERSON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'david', 'william', 'richard', 'joseph', 'thomas', 'charles',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth',
  'maria', 'anna', 'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'emily', 'donna',
  'alex', 'sam', 'chris', 'jordan', 'taylor', 'casey', 'morgan', 'riley', 'jamie', 'drew',
  'marko', 'ana', 'mia', 'stefan', 'nikola', 'elena', 'ivan', 'peter', 'georg', 'hans',
]);

/** L7: Classify a proper noun phrase with disambiguation scoring */
function classifyProperNoun(name: string): ExtractedEntity['type'] {
  const words = name.split(/\s+/);
  const firstName = words[0].toLowerCase();

  // Score each category
  const isOrg = ORG_INDICATORS.test(name);
  const isConcept = CONCEPT_INDICATORS.test(name);
  const isProject = PROJECT_INDICATORS.test(name);
  const isPerson = PERSON_FIRST_NAMES.has(firstName);

  // If only one category matches, use it
  const matchCount = [isOrg, isConcept, isProject, isPerson].filter(Boolean).length;

  if (matchCount === 0) {
    // No indicators — if 2-3 words with no concept/org words, likely a person
    if (words.length >= 2 && words.length <= 3) return 'person';
    return 'concept'; // Default ambiguous multi-word phrases to concept, not person
  }

  if (matchCount === 1) {
    if (isPerson) return 'person';
    if (isOrg) return 'organization';
    if (isProject) return 'project';
    if (isConcept) return 'concept';
  }

  // Multiple matches — use priority: person name > organization > project > concept
  if (isPerson) return 'person';
  if (isOrg) return 'organization';
  if (isProject) return 'project';
  return 'concept';
}

export function extractEntities(text: string): ExtractedEntity[] {
  if (text.length < 10) return [];

  const seen = new Set<string>();
  const entities: ExtractedEntity[] = [];

  function add(name: string, type: ExtractedEntity['type'], confidence: number) {
    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({ name, type, confidence });
  }

  // Extract technology terms
  const words = text.toLowerCase().split(/[\s,;:.!?()/]+/);
  for (const word of words) {
    if (TECH_TERMS.has(word)) {
      add(word.charAt(0).toUpperCase() + word.slice(1), 'technology', 0.9);
    }
  }

  // Extract proper nouns (multi-word = likely person names)
  let match;
  while ((match = PROPER_NOUN_RE.exec(text)) !== null) {
    const name = match[1];
    const firstWord = name.split(' ')[0];
    if (SKIP_WORDS.has(firstWord)) continue;
    if (name.length < 3) continue;
    add(name, classifyProperNoun(name), 0.7);
  }

  return entities;
}

/** Extracted semantic relation between two entities. */
export interface ExtractedRelation {
  source: string;
  target: string;
  relationType: string;
  confidence: number;
}

const RELATION_PATTERNS: Array<{ re: RegExp; type: string; conf: number }> = [
  { re: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:is led by|leads?|managed by|manages?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g, type: 'led_by', conf: 0.9 },
  { re: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:reports? to|works? (?:for|under))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g, type: 'reports_to', conf: 0.9 },
  { re: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:depends? on|requires?|relies? on)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g, type: 'depends_on', conf: 0.85 },
  { re: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:is maintained by|built by|created by|owned by)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g, type: 'maintained_by', conf: 0.85 },
  { re: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:from|at|works? at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g, type: 'affiliated_with', conf: 0.75 },
  { re: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:approved|signed|confirmed)\s+/g, type: 'approved', conf: 0.8 },
];

/** Extract semantic relations between entities from text. */
export function extractRelations(text: string, entities: ExtractedEntity[]): ExtractedRelation[] {
  if (entities.length < 2 || text.length < 20) return [];
  const relations: ExtractedRelation[] = [];
  const names = new Set(entities.map(e => e.name.toLowerCase()));

  for (const { re, type, conf } of RELATION_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const src = m[1]?.trim();
      const tgt = m[2]?.trim();
      if (!src || !tgt || src.length < 3 || tgt.length < 3) continue;
      if (names.has(src.toLowerCase()) || names.has(tgt.toLowerCase())) {
        relations.push({ source: src, target: tgt, relationType: type, confidence: conf });
      }
    }
  }
  return relations;
}

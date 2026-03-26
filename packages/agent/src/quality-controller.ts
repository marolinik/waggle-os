export interface QualityIssue {
  type: 'verbose' | 'emoji_spam' | 'filler' | 'too_many_bullets';
  message: string;
}

const FILLER_PHRASES = [
  /great question/i,
  /i'd be happy to help/i,
  /that's a (great|good|excellent) (question|point)/i,
  /absolutely!/i,
  /of course!/i,
  /let me (help|assist|explain)/i,
  /i hope (this|that) helps/i,
  /feel free to/i,
];

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

export function checkResponseQuality(text: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check verbosity (> 15 lines)
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length > 15) {
    issues.push({ type: 'verbose', message: `Response has ${lines.length} lines (max 15 recommended)` });
  }

  // Check emoji count (> 2)
  const emojis = text.match(EMOJI_RE) ?? [];
  if (emojis.length > 2) {
    issues.push({ type: 'emoji_spam', message: `${emojis.length} emojis detected (max 2 recommended)` });
  }

  // Check filler phrases
  for (const pattern of FILLER_PHRASES) {
    if (pattern.test(text)) {
      issues.push({ type: 'filler', message: `Contains filler phrase: "${text.match(pattern)?.[0]}"` });
      break; // Only flag once
    }
  }

  // Check bullet overuse (> 5)
  const bullets = text.split('\n').filter(l => /^\s*[-*•]\s/.test(l));
  if (bullets.length > 5) {
    issues.push({ type: 'too_many_bullets', message: `${bullets.length} bullet points (max 5 recommended)` });
  }

  return issues;
}

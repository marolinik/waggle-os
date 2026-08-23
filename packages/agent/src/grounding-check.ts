import { normalizeQuantitativeNumbers } from './quantitative-number.js';

/**
 * Grounding check — detects QUANTITATIVE specifics asserted in an agent reply
 * that are NOT present in the sources the reply is supposed to be grounded in
 * (recalled memory + the user's message + conversation).
 *
 * Why this exists: prompt instructions alone do not stop a model from
 * embellishing correct recall with plausible-adjacent invented specifics — e.g.
 * stating "4 months runway" or "227 entities" when neither appears in memory
 * (verified live, 2026-06; see docs/audits/2026-06-01-memory-overclaim-
 * investigation.md). A post-generation check catches these deterministically.
 *
 * Scope (deliberately conservative — false positives are worse than misses,
 * matching pattern-write-back's philosophy): money, percentages, durations, and
 * counts paired with a curated "stat noun". Bare advice quantities ("3 questions",
 * "2 options") are NOT flagged. Proper-noun-only confabulations ("OpenClaw") are
 * out of scope here — they need the LLM verifier layer (Phase 2). This module is
 * a cheap, deterministic pre-filter + observability signal, not the whole fix.
 */

export type SpecificKind = 'money' | 'percent' | 'duration' | 'count';
type MoneyCadencePeriod = 'week' | 'month' | 'quarter' | 'year';
type MoneyCadenceUnit = MoneyCadencePeriod | 'seat' | 'user';
type MoneyCadence = MoneyCadenceUnit | `${'seat' | 'user'}/${MoneyCadencePeriod}`;

export interface ClaimedSpecific {
  /** The exact matched phrase, e.g. "4 months", "$19/month", "227 entities". */
  text: string;
  kind: SpecificKind;
  /** The numeric core used for grounding lookup, e.g. "4", "19", "227". */
  number: string;
  /** The unit/noun stem, lowercased + de-pluralized, e.g. "month", "entity". */
  unit: string;
  /** Nearby finance field used to bind money claims to the matching source fact. */
  subject?: string;
  /** Normalized recurring price period when the claim includes one. */
  cadence?: MoneyCadence;
  /** Canonical ISO currency when the claim makes one explicit. */
  currency?: string;
}

export interface GroundingResult {
  specifics: ClaimedSpecific[];
  grounded: ClaimedSpecific[];
  ungrounded: ClaimedSpecific[];
  /** grounded / total; 1 when there are no quantitative specifics to check. */
  score: number;
}

/** Count nouns worth grounding — stats a model invents as facts about the user
 * or system. Curated to exclude benign advice units (questions, steps, options,
 * ways, things, points, reasons, times, items). */
const STAT_NOUNS = [
  'entity', 'entities', 'user', 'users', 'workspace', 'workspaces', 'seat', 'seats',
  'frame', 'frames', 'memory', 'memories', 'session', 'sessions', 'customer', 'customers',
  'employee', 'employees', 'gpu', 'gpus', 'h200', 'h200s', 'rack', 'racks', 'node', 'nodes',
  'token', 'tokens', 'subscriber', 'subscribers', 'member', 'members', 'agent', 'agents',
  'document', 'documents', 'record', 'records', 'connector', 'connectors',
];

const MONEY_CADENCE_PERIOD = String.raw`(?:calendar[ \t]+(?:weeks?|months?|quarters?|years?)|weeks?|wks?|monthly|months?|mos?|quarters?|qtrs?|yearly|annually|annual|years?|yrs?|annum)`;
const MONEY_BILLING_VERB = String.raw`(?:billed|charged|invoiced|payable)`;
const MONEY_DIRECT_CADENCE = String.raw`(?:weekly|monthly|quarterly|yearly|annually|annual|${MONEY_BILLING_VERB}[ \t]+(?:weekly|monthly|quarterly|yearly|annually|annual)|${MONEY_BILLING_VERB}[ \t]+(?:per|each|every)[ \t]+(?:calendar[ \t]+)?(?:week|month|quarter|year)|(?:a|each|every)[ \t]+(?:calendar[ \t]+)?(?:week|month|quarter|year))`;
const MONEY_UNSUPPORTED_DIRECT_CADENCE = String.raw`(?:(?:[a-z]{2,12}-?)?(?:daily|hourly|nightly|weekly|monthly|quarterly|yearly|annually)|fortnightly|semiannually|biennially|qtrly|pcm|pa|(?:once|twice|thrice)(?:[ \t]+(?:a|per))?[ \t]+(?:hour|day|week|month|quarter|year|daily|weekly|monthly|quarterly|yearly)|(?:each|every)[ \t]+(?:fortnights?|days?)|(?:each|every)[ \t]+(?:other|\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)[ \t]+(?:hours?|days?|weeks?|months?|quarters?|years?))`;
const MONEY_UNSUPPORTED_PUNCTUATED_CADENCE = String.raw`(?:p\.a\.|p\.m\.)(?![a-z])`;
const MONEY_CADENCE_SEPARATOR = String.raw`(?:[ \t]?\/[ \t]?|[ \t]+per[ \t]+)`;
const MONEY_CADENCE_BODY = String.raw`(?:(?:seats?|users?)(?:${MONEY_CADENCE_SEPARATOR}${MONEY_CADENCE_PERIOD})?|${MONEY_CADENCE_PERIOD})`;
const MONEY_CADENCE_SUFFIX = String.raw`(?:${MONEY_CADENCE_SEPARATOR}${MONEY_CADENCE_BODY}\b|[ \t]+${MONEY_DIRECT_CADENCE}\b)`;
const MONEY_CURRENCY_BODY = String.raw`(?:usd|dollars?)`;
const NON_USD_CURRENCY_CODE_BODY = String.raw`(?:aed|ars|aud|brl|cad|chf|clp|cny|cop|czk|dkk|egp|eur|gbp|hkd|huf|idr|ils|inr|jpy|krw|mxn|myr|ngn|nok|nzd|php|pln|qar|ron|rub|sar|sek|sgd|thb|try|twd|uah|vnd|zar)`;
const NON_USD_CURRENCY_NAME_BODY = String.raw`(?:euros?|sterling|francs?|yen|yuan|renminbi|rupees?|rubles?)`;
const NON_USD_CURRENCY_SYMBOL_BODY = String.raw`[€£¥₹₽₩]`;
const CNY_SYMBOL_TOKEN_BODY = String.raw`\b(?:cn|rmb)[ \t]*¥`;
const MONEY_MAGNITUDE_BODY = String.raw`(?:k|m|b|bn|billion|million|thousand)`;
const NUMBER_BODY = String.raw`(?<![\d,.])(?:\d{1,3}(?:,\d{3}){1,9}|\d{1,30})(?:\.\d{1,12})?(?!\d|[,.]\d)`;
const MONEY_SUFFIX = String.raw`(?:(?:[ \t]*${MONEY_CURRENCY_BODY}\b(?:${MONEY_CADENCE_SUFFIX})?)|(?:${MONEY_CADENCE_SUFFIX}(?:[ \t]*${MONEY_CURRENCY_BODY}\b)?))?`;
const MONEY_TRAILING_GUARD = String.raw`(?![a-z])(?![ \t]*(?:(?:${MONEY_CURRENCY_BODY}|${MONEY_DIRECT_CADENCE}|${MONEY_UNSUPPORTED_DIRECT_CADENCE})\b|${MONEY_BILLING_VERB}[ \t]+${MONEY_UNSUPPORTED_DIRECT_CADENCE}\b|${MONEY_UNSUPPORTED_PUNCTUATED_CADENCE}|(?:\/[ \t]*|per[ \t]+)[a-z]))`;
const MONEY_BODY = String.raw`\$[ \t]?(?:[-+−][ \t]?)?${NUMBER_BODY}[ \t]*(?:${MONEY_MAGNITUDE_BODY}\b)?${MONEY_SUFFIX}${MONEY_TRAILING_GUARD}`;
const MONEY_RE = new RegExp(`(?:\\(\\s*(?:[-+−]\\s*)?${MONEY_BODY}[ \\t]*\\)|(?:[-+−][ \\t]*)?${MONEY_BODY})`, 'gi');
const REGIONAL_DOLLAR_PREFIX_BODY = String.raw`(?:us|ca|c|r|a|au|nz|sg|s|hk|nt)`;
const FOREIGN_CURRENCY_TOKEN_BODY = String.raw`(?:${CNY_SYMBOL_TOKEN_BODY}|\b(?:${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY})\b|\b${REGIONAL_DOLLAR_PREFIX_BODY}(?=\$)|${NON_USD_CURRENCY_SYMBOL_BODY})`;
const FOREIGN_MONEY_RE = new RegExp(
  `(?:(?:[-+−][ \\t]*|\\([ \\t]*)?${FOREIGN_CURRENCY_TOKEN_BODY}[ \\t]*\\$?[ \\t]*(?:\\([ \\t]*)?(?:[-+−][ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?(?:${MONEY_CADENCE_SUFFIX})?[ \\t]*\\)?|(?:[-+−][ \\t]*|\\([ \\t]*)?(?:\\$[ \\t]*)?(?:[-+−][ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?[ \\t]+${FOREIGN_CURRENCY_TOKEN_BODY}(?:${MONEY_CADENCE_SUFFIX})?[ \\t]*\\)?)${MONEY_TRAILING_GUARD}`,
  'gi',
);
const USD_PREFIX_MONEY_RE = new RegExp(
  `(?:[-+−][ \\t]*|\\([ \\t]*)?${MONEY_CURRENCY_BODY}\\b[ \\t]*\\$?[ \\t]*(?:[-+−][ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?(?:${MONEY_CADENCE_SUFFIX})?[ \\t]*\\)?${MONEY_TRAILING_GUARD}`,
  'gi',
);
const COMPACT_FOREIGN_SUFFIX_MONEY_RE = new RegExp(
  `(?:[-+−][ \\t]*|\\([ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?[ \\t]*${NON_USD_CURRENCY_SYMBOL_BODY}(?:${MONEY_CADENCE_SUFFIX})?[ \\t]*\\)?${MONEY_TRAILING_GUARD}`,
  'gi',
);
const LINKED_CURRENCY_MONEY_RE = new RegExp(
  `(?:[-+−][ \\t]*|\\([ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?[ \\t]+(?:in|of|as)[ \\t]+(?:${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY})\\b(?:${MONEY_CADENCE_SUFFIX})?[ \\t]*\\)?${MONEY_TRAILING_GUARD}`,
  'gi',
);
const BARE_MONEY_CADENCE_RE = new RegExp(
  `(?<![$\\d.,+−-])(?:[-+−][ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?(?:[ \\t]*${MONEY_CURRENCY_BODY}\\b${MONEY_CADENCE_SUFFIX}|${MONEY_CADENCE_SUFFIX}(?:[ \\t]*${MONEY_CURRENCY_BODY}\\b)?)${MONEY_TRAILING_GUARD}`,
  'gi',
);
const BARE_MONEY_RE = new RegExp(
  `(?<![$\\d.,+−-])(?:[-+−][ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?[ \\t]*${MONEY_CURRENCY_BODY}\\b${MONEY_TRAILING_GUARD}`,
  'gi',
);
const MAGNITUDE_NUMBER_RE = new RegExp(`(?:[-+−][ \\t]*)?${NUMBER_BODY}[ \\t]*${MONEY_MAGNITUDE_BODY}\\b`, 'gi');
const ISO_CURRENCY_CODE_BODY = String.raw`(?:usd|${NON_USD_CURRENCY_CODE_BODY})`;
const COMPACT_ISO_PREFIX_MONEY_RE = new RegExp(
  `(?:[-+−][ \\t]*)?\\b${ISO_CURRENCY_CODE_BODY}(?=\\d)${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?(?:${MONEY_CADENCE_SUFFIX})?${MONEY_TRAILING_GUARD}`,
  'gi',
);
const COMPACT_ISO_SUFFIX_MONEY_RE = new RegExp(
  `(?:[-+−][ \\t]*)?${NUMBER_BODY}[ \\t]*(?:${MONEY_MAGNITUDE_BODY}\\b)?${ISO_CURRENCY_CODE_BODY}\\b(?:${MONEY_CADENCE_SUFFIX})?${MONEY_TRAILING_GUARD}`,
  'gi',
);
const SIGNED_QUANTITATIVE_BODY = String.raw`(?<![-+\d,.])(?:[-+][ \t]*)?\d{1,30}(?:\.\d{1,12})?(?!\d|[,.]\d)`;
const UNSIGNED_QUANTITATIVE_BODY = String.raw`(?<![\d,.])\d{1,30}(?:\.\d{1,12})?(?!\d|[,.]\d)`;
const PERCENT_MARKER_BODY = String.raw`(?:%|per[ \t]+cent\b|pct\b|percent\b|percentage[ \t]+points?\b|pp\b)`;
const PERCENT_RE = new RegExp(
  `(?:\\([ \\t]*(${UNSIGNED_QUANTITATIVE_BODY})[ \\t]*(${PERCENT_MARKER_BODY})[ \\t]*\\)|(${SIGNED_QUANTITATIVE_BODY})[ \\t]*(${PERCENT_MARKER_BODY}))`,
  'gi',
);
const DURATION_RE = new RegExp(
  `(${SIGNED_QUANTITATIVE_BODY})[ \\t-]*((?:second|minute|hour|day|week|month|quarter|year)s?)\\b`,
  'gi',
);
// number + noun; the noun is filtered against STAT_NOUNS below.
const COUNT_RE = new RegExp(
  `(${SIGNED_QUANTITATIVE_BODY})[ \\t]+([a-z][a-z0-9-]{1,20})\\b`,
  'gi',
);
const COUNT_MAGNITUDE_RE = new RegExp(
  `(${SIGNED_QUANTITATIVE_BODY})[ \\t]*(${MONEY_MAGNITUDE_BODY})\\b[ \\t]+([a-z][a-z0-9-]{1,20})\\b`,
  'gi',
);
const CODE_DECLARATION_ASSIGNMENT_RE = /(?:^|[;{}\r\n])[ \t]*(?:const|let|var|readonly|final)[ \t]+[a-z_$][\w$]*(?:[ \t]*:[^=;\r\n]+)?[ \t]*=[ \t]*$/i;
const CODE_BARE_ASSIGNMENT_RE = /(?:^|[;{}\r\n])[ \t]*[a-z_$][\w$]*[ \t]*=[ \t]*$/;
const CODE_OBJECT_PROPERTY_ASSIGNMENT_RE = /\b(?:const|let|var|readonly|final)\b[^;{}\r\n]{0,80}=[ \t]*\{[^;{}\r\n]{0,80}\b[a-z_$][\w$]*[ \t]*:[ \t]*$/i;
const HASH_COMMENT_ASSIGNMENT_RE = /^[ \t]*(?:(?:const|let|var|readonly|final)[ \t]+)?[a-z_$][\w$]*(?:[ \t]*\.[ \t]*[a-z_$][\w$]*)*[ \t]*=/i;
const ORIGINAL_DIGIT_BODY = String.raw`[0-9０-９]`;
const MALFORMED_NUMERIC_JOINER_BODY = String.raw`(?:_|\u200b|\u200c|\u200d|\u2060|\ufeff)`;
const MALFORMED_NUMERIC_FOLLOW_BODY = String.raw`(?:${MALFORMED_NUMERIC_JOINER_BODY}|[-+−])`;

function codeCommentRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] === '/' && text[index + 1] === '*') {
      const close = text.indexOf('*/', index + 2);
      const end = close < 0 ? text.length : close + 2;
      ranges.push({ start: index, end });
      index = end;
      continue;
    }

    const previous = text[index - 1];
    const canStartLineComment = index === 0
      || previous === '\n'
      || previous === '\r'
      || /[;{}() \t]/.test(previous);
    const hashAssignmentComment = canStartLineComment
      && text[index] === '#'
      && HASH_COMMENT_ASSIGNMENT_RE.test(text.slice(index + 1, index + 161));
    const lineComment = canStartLineComment
      && ((text[index] === '/' && text[index + 1] === '/')
        || (text[index] === '-' && text[index + 1] === '-')
        || hashAssignmentComment);
    if (lineComment) {
      let end = index + 2;
      while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end += 1;
      ranges.push({ start: index, end });
      index = end;
      continue;
    }
    index += 1;
  }
  return ranges;
}

function normalizeGroundingText(value: string): string {
  return normalizeQuantitativeNumbers(value);
}

function hasMalformedQuantitativeBoundary(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 12), start);
  const after = text.slice(end, Math.min(text.length, end + 12));
  if (/[a-z0-9_]$/i.test(before) || /^[a-z0-9_]/i.test(after)) return true;
  return new RegExp(
    `${ORIGINAL_DIGIT_BODY}[ \\t]*${MALFORMED_NUMERIC_JOINER_BODY}[ \\t]*$`,
    'u',
  ).test(before) || new RegExp(
    `^${MALFORMED_NUMERIC_FOLLOW_BODY}[ \\t]*${ORIGINAL_DIGIT_BODY}`,
    'u',
  ).test(after);
}

const MONEY_SUBJECT_BODY = String.raw`arr|mrr|ebitda|cogs|capex|opex|payroll|salar(?:y|ies)|valuations?|assets?|liabilities|debts?|losses?|cash|revenues?|burns?|costs?|prices?|pricing|budgets?|balances?|bookings?|margins?|incomes?|sales|spend|expenses?|profits?`;
const MONEY_SUBJECT_QUALIFIER_BODY = String.raw`(?:gross|net|adjusted|reported|current|fixed|annual|monthly|non[ \t-]+recurring|recurring|operating|capital|contribution|average|total|actual|projected|forecast(?:ed)?|target(?:ed)?|budgeted|potential|expected|estimated|competitor(?:'s)?|their|his|her|its|prior|previous|last[ \t]+year)`;
const MONEY_QUALIFIED_SUBJECT_BODY = String.raw`(?:${MONEY_SUBJECT_QUALIFIER_BODY}[ 	]+){0,2}(?:${MONEY_SUBJECT_BODY})`;
const MONEY_SUBJECT_RE = new RegExp(`\\b(${MONEY_QUALIFIED_SUBJECT_BODY})\\b`, 'gi');
const MONEY_SUBJECT_TOKEN_RE = new RegExp(`\\b(?:${MONEY_SUBJECT_BODY})\\b`, 'i');
const MONEY_SUBJECT_AFTER_RE = new RegExp(
  `^[ \\t]*(?:(?:dollars?|usd)[ \\t]+)?(?:(is|for|in|of|as)[ \\t]+)?(?:monthly[ \\t]+)?(${MONEY_QUALIFIED_SUBJECT_BODY})\\b`,
  'i',
);
const MONEY_FACT_BLOCKER_RE = /\b(?:not|never|no|without|missing|absent|unknown|unavailable|unsupplied|below|above|under|over|less[ \t]+than|more[ \t]+than|at[ \t]+most|at[ \t]+least)\b/i;
const SUBJECT_ZERO_RE = new RegExp(
  `\\b(${MONEY_QUALIFIED_SUBJECT_BODY})\\b([^.;!?\\r\\n]{0,24})\\bzero\\b`,
  'g',
);
const ZERO_SUBJECT_RE = new RegExp(
  `\\b(?:(not|never|no|without)[ \\t]+)?zero\\b([ \\t]+(?:${MONEY_QUALIFIED_SUBJECT_BODY})\\b)`,
  'g',
);
const MONEY_CONFLICTING_SUFFIX_RE = new RegExp(
  `^[ \\t]*(?:%|percent(?:age)?(?:[ \\t]+points?)?|pp\\b|monthly\\b|yearly\\b|annually\\b|seconds?\\b|minutes?\\b|hours?\\b|days?\\b|weeks?\\b|months?\\b|quarters?\\b|years?\\b|units?\\b|euros?\\b|eur\\b|pounds?\\b|gbp\\b|yen\\b|jpy\\b|yuan\\b|cny\\b|(?:${STAT_NOUNS.join('|')})\\b)`,
  'i',
);
const MONEY_ALLOWED_FOLLOWING_WORD_RE = /^(?:dollars?|usd|is|was|are|were|equals?|equal|totaled|at|and|but|while|whereas|on|from|to|by|about|approximately|around|roughly|today|yesterday|currently|now|then)$/i;
const MONEY_ALLOWED_PRECEDING_WORD_RE = /^(?:is|was|are|were|equals?|equal|totals?|totaled|has|had|recorded|reached|at|of|by|to|about|approximately|around|roughly|nearly|exactly|plus|minus|and|but|while|whereas)$/i;
const MONEY_FORWARD_LINK_RE = new RegExp(
  `^\\s*(?:on\\s+hand\\s*)?(?:(?:(?:is|was|are|were)(?:\\s+(?:about|approximately|around|roughly|estimated(?:\\s+at)?))?|equals?|totals?|totaled|recorded|reported|stands?\\s+at|estimated(?:\\s+at)?|came\\s+in\\s+at|(?:has\\s+|had\\s+)?reached|rose(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|grew(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|increased(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|decreased(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|dropped(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|improved(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|declined(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|fell(?:\\s+(?:by|to))?(?:\\s+(?:about|approximately|around|roughly))?|at|of|about|approximately|around|roughly)\\s*)?[=:]?\\s*(?:${FOREIGN_CURRENCY_TOKEN_BODY}[ \\t]*)?\\$?\\s*$`,
  'i',
);
const MONEY_REVERSE_LINK_RE = /^(?:[ \t]*(?:dollars?|usd))?[ \t]*(?:(?:is|in|of|as)[ \t]+)?(?:monthly[ \t]+)?$/i;
const PRICING_PLAN_LINK_RE = new RegExp(
  `^\\s*(?:(?::|for|[-–—])\\s*)?[a-z][a-z0-9-]*(?:\\s+[a-z][a-z0-9-]*)?(?:\\s+(?:is|at)|\\s*[-–—])?\\s*(?:${FOREIGN_CURRENCY_TOKEN_BODY}[ \\t]*)?\\$?\\s*$`,
  'i',
);

const num = (s: string): string => {
  const numberMatch = s.match(/\d[\d,]*(?:\.\d+)?/);
  if (!numberMatch) return '';
  const [wholeRaw, fractionRaw = ''] = numberMatch[0].replace(/,/g, '').split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  const suffix = s
    .slice((numberMatch.index ?? 0) + numberMatch[0].length)
    .match(new RegExp(`^[ \\t]*(${MONEY_MAGNITUDE_BODY})\\b`, 'i'))?.[1]?.toLowerCase();
  const exponent = suffix === 'k' || suffix === 'thousand'
    ? 3
    : suffix === 'm' || suffix === 'million'
      ? 6
      : suffix === 'b' || suffix === 'bn' || suffix === 'billion'
        ? 9
        : 0;
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0';
  const scale = fraction.length - exponent;
  let value: string;
  if (scale <= 0) {
    value = `${digits}${'0'.repeat(-scale)}`;
  } else {
    const splitAt = digits.length - scale;
    value = splitAt <= 0
      ? `0.${'0'.repeat(-splitAt)}${digits}`
      : `${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;
    value = value.replace(/\.?0+$/, '');
  }
  value = value.replace(/^0+(?=\d)/, '') || '0';
  const numberPrefix = s.slice(0, numberMatch.index ?? 0);
  const accounting = /^\s*\(/.test(s)
    || (/\([ \t]*$/.test(numberPrefix) && /\)[ \t]*$/.test(s));
  const sign = accounting || /[-−]/.test(numberPrefix) ? -1 : 1;
  return value === '0' ? value : `${sign < 0 ? '-' : ''}${value}`;
};

function quantitativeNumber(text: string, start: number, raw: string): string {
  const parsed = num(raw);
  if (!parsed.startsWith('-') || !/^\s*-[ \t]+/.test(raw)) return parsed;
  const lineBefore = text.slice(text.lastIndexOf('\n', start - 1) + 1, start);
  return lineBefore.trim() ? parsed : parsed.slice(1);
}

function moneyCadence(raw: string): MoneyCadence | undefined {
  const cadencePattern = new RegExp(
    `(?:(?:\\/[ \\t]*|\\bper[ \\t]+)(${MONEY_CADENCE_PERIOD}|seats?|users?)\\b|\\b(${MONEY_DIRECT_CADENCE})\\b)`,
    'gi',
  );
  const units = [...raw.matchAll(cadencePattern)]
    .map((match): MoneyCadenceUnit => {
      const unit = (match[1] ?? match[2]).toLowerCase()
      .replace(/^(?:billed|charged|invoiced|payable)[ \t]+/, '')
        .replace(/^(?:a|per|each|every)[ \t]+/, '')
        .replace(/^calendar[ \t]+/, '');
      if (unit.startsWith('week') || unit.startsWith('wk')) return 'week';
      if (unit.startsWith('mo')) return 'month';
      if (unit.startsWith('quarter') || unit.startsWith('qtr')) return 'quarter';
      if (unit.startsWith('yr') || unit.startsWith('year')
        || unit.startsWith('annual') || unit === 'annum') return 'year';
      if (unit.startsWith('a ') || unit.startsWith('each ') || unit.startsWith('every ')) {
        return unit.endsWith('week')
          ? 'week'
          : unit.endsWith('month')
            ? 'month'
            : unit.endsWith('quarter')
              ? 'quarter'
              : 'year';
      }
      if (unit.startsWith('seat')) return 'seat';
      return 'user';
    });
  if (units.length === 0) return undefined;
  if ((units[0] === 'seat' || units[0] === 'user')
    && (units[1] === 'week' || units[1] === 'month'
      || units[1] === 'quarter' || units[1] === 'year')) {
    return `${units[0]}/${units[1]}`;
  }
  return units[0];
}

function contextualPricingCadence(clause: string, anchor: 'start' | 'end'): MoneyCadence | undefined {
  const phrase = `(?:${MONEY_DIRECT_CADENCE}[ \\t]+(?:prices?|pricing)|(?:prices?|pricing)${MONEY_CADENCE_SUFFIX})`;
  const pattern = anchor === 'end'
    ? new RegExp(`\\b(${phrase})[ \\t]*(?:(?:is|was|are|were|equals?|at)[ \\t]*)?[:=]?[ \\t]*$`, 'i')
    : new RegExp(`^[ \\t]*(?:(?:is|for|in|of|as)[ \\t]+)?(${phrase})\\b`, 'i');
  const matchedPhrase = clause.match(pattern)?.[1];
  return matchedPhrase ? moneyCadence(matchedPhrase) : undefined;
}

function moneyCadenceAt(text: string, start: number, raw: string): MoneyCadence | undefined {
  const direct = moneyCadence(raw);
  if (direct) return direct;

  const before = text.slice(Math.max(0, start - 48), start);
  const beforeClause = before.split(/[;.!?\r\n]/).at(-1) ?? '';
  const beforeCadence = contextualPricingCadence(beforeClause, 'end');
  if (beforeCadence) return beforeCadence;
  const pricingBefore = beforeClause.match(new RegExp(
    `\\b(?:prices?|pricing)[ \\t]+(?:is[ \\t]+)?(${MONEY_DIRECT_CADENCE})[ \\t]+(?:at|of|for)[ \\t]*$`,
    'i',
  ))?.[1];
  if (pricingBefore) return moneyCadence(pricingBefore);

  const after = text.slice(start + raw.length, Math.min(text.length, start + raw.length + 48));
  const afterClause = after.split(/[;.!?\r\n]/)[0] ?? '';
  const nearby = afterClause.match(new RegExp(
    `^[ \\t]*(?:,[ \\t]*)?(?:\\([ \\t]*)?(${MONEY_DIRECT_CADENCE})(?:[ \\t]*\\))?`,
    'i',
  ))?.[1];
  if (nearby) return moneyCadence(nearby);
  return contextualPricingCadence(afterClause, 'start');
}

function canonicalCurrencyToken(raw: string): string | undefined {
  const token = raw.trim().toLowerCase();
  if (/^(?:usd|dollars?|us)$/.test(token)) return 'usd';
  if (/^(?:ca|c)$/.test(token)) return 'cad';
  if (token === 'r') return 'brl';
  if (/^(?:a|au)$/.test(token)) return 'aud';
  if (token === 'nz') return 'nzd';
  if (/^(?:sg|s)$/.test(token)) return 'sgd';
  if (token === 'hk') return 'hkd';
  if (token === 'nt') return 'twd';
  if (/^(?:eur|euros?|€)$/.test(token)) return 'eur';
  if (/^(?:gbp|pounds?|sterling|£)$/.test(token)) return 'gbp';
  if (/^(?:jpy|yen|¥)$/.test(token)) return 'jpy';
  if (/^(?:cny|yuan|renminbi|(?:cn|rmb)[ \t]*¥)$/.test(token)) return 'cny';
  if (/^(?:inr|rupees?|₹)$/.test(token)) return 'inr';
  if (/^(?:rub|rubles?|₽)$/.test(token)) return 'rub';
  if (/^(?:krw|won|₩)$/.test(token)) return 'krw';
  if (/^(?:chf|francs?)$/.test(token)) return 'chf';
  if (new RegExp(`^${NON_USD_CURRENCY_CODE_BODY}$`, 'i').test(token)) return token;
  return undefined;
}

function moneyCurrencyAt(text: string, start: number, end: number): string | undefined {
  const raw = text.slice(start, end);
  const before = text.slice(Math.max(0, start - 16), start);
  const after = text.slice(end, Math.min(text.length, end + 24));
  const linkedSuffix = after.match(
    new RegExp(`^[ \t]*(?:in|of|as)[ \t]+(${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY})\\b`, 'i'),
  )?.[1];
  if (linkedSuffix) return canonicalCurrencyToken(linkedSuffix);
  const suffix = after.match(
    new RegExp(`^[ \\t]*(${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY})\\b`, 'i'),
  )?.[1];
  if (suffix) return canonicalCurrencyToken(suffix);

  const cnySymbol = raw.match(new RegExp(CNY_SYMBOL_TOKEN_BODY, 'i'))?.[0];
  if (cnySymbol) return canonicalCurrencyToken(cnySymbol);
  const compactPrefix = raw.match(new RegExp(`\\b(${ISO_CURRENCY_CODE_BODY})(?=\\d)`, 'i'))?.[1];
  if (compactPrefix) return canonicalCurrencyToken(compactPrefix);
  const compactSuffix = raw.match(new RegExp(`\\d(${ISO_CURRENCY_CODE_BODY})\\b`, 'i'))?.[1];
  if (compactSuffix) return canonicalCurrencyToken(compactSuffix);

  const regionalRawToken = raw.match(/\b(us|ca|c|r|a|au|nz|sg|s|hk|nt)(?=\$)/i)?.[1];
  if (regionalRawToken) return canonicalCurrencyToken(regionalRawToken);
  const rawToken = raw.match(
    new RegExp(`\\b(${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY})\\b|(${NON_USD_CURRENCY_SYMBOL_BODY})`, 'i'),
  );
  const rawCurrency = rawToken?.[1] ?? rawToken?.[2];
  if (rawCurrency) return canonicalCurrencyToken(rawCurrency);

  const regionalDollar = before.match(/\b(us|ca|c|r|a|au|nz|sg|s|hk|nt)$/i)?.[1]?.toLowerCase()
    ?? before.match(/\b(us|ca|c|r|a|au|nz|sg|s|hk|nt)\$$/i)?.[1]?.toLowerCase();
  if (regionalDollar && (raw.includes('$') || before.endsWith('$'))) {
    if (regionalDollar === 'us') return 'usd';
    if (regionalDollar === 'ca') return 'cad';
    if (regionalDollar === 'c') return 'cad';
    if (regionalDollar === 'r') return 'brl';
    if (regionalDollar === 'nz') return 'nzd';
    if (regionalDollar === 'sg') return 'sgd';
    if (regionalDollar === 's') return 'sgd';
    if (regionalDollar === 'hk') return 'hkd';
    if (regionalDollar === 'nt') return 'twd';
    return 'aud';
  }

  const prefix = before.match(
    new RegExp(`(${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY}|${NON_USD_CURRENCY_SYMBOL_BODY})[ \\t]*\\$?[ \\t]*$`, 'i'),
  )?.[1];
  if (prefix) return canonicalCurrencyToken(prefix);
  if (raw.includes('$') || before.endsWith('$')) return 'usd';
  return undefined;
}

function moneyNumber(text: string, start: number, raw: string): string {
  const parsed = num(raw);
  if (!parsed.startsWith('-')) return parsed;

  const before = text.slice(Math.max(0, start - 16), start);
  const lineBefore = text.slice(text.lastIndexOf('\n', start - 1) + 1, start);
  const pricingPlanSeparator = /\b(?:prices?|pricing)\s*:\s*[^:]{1,40}$/i.test(lineBefore);
  if (parsed.startsWith('-') && /^\s*[-−](?=[$€£¥₹₽₩])/.test(raw)
    && !pricingPlanSeparator) return parsed;
  if (parsed.startsWith('-') && /^\s*-/.test(raw)) {
    const spacedSign = /^\s*-[ \t]+/.test(raw);
    const bulletContext = !lineBefore.trim();
    const negativeLabel = /\b(?:loss|deficit)\s*:\s*$/i.test(lineBefore);
    const explicitNegativeContext = /(?:[-+*/×÷−:=(,;$]|\b(?:is|was|were|equals?|at|of|by|to|loss|deficit))\s*$/i
      .test(before);
    if ((spacedSign && bulletContext && !negativeLabel)
      || (lineBefore.trim() && !explicitNegativeContext)) {
      return parsed.slice(1);
    }
  }
  if (!/^\s*\(/.test(raw)) return parsed;
  if (/^\s*\(\s*(?:[-−]\s*\$|\$[ \t]*[-−])/.test(raw)) return parsed;

  const after = text.slice(start + raw.length, Math.min(text.length, start + raw.length + 24));
  const groupedOperand = /[-+*/×÷−]\s*$/.test(before)
    || /^\s*[-+*/×÷−]\s*\(?\s*(?:[-−]\s*)?\$/.test(after);
  const apposition = new RegExp(
    `\\b(?:cash(?:\\s+(?:on\\s+hand|balance))?|${MONEY_SUBJECT_BODY})\\s*$`,
    'i',
  ).test(before);
  return groupedOperand || apposition ? parsed.slice(1) : parsed;
}
const stem = (w: string): string => w.toLowerCase().replace(/s$/, '').replace(/ie$/, 'y');

type MoneySubjectDirection = 'before' | 'after';

interface MoneySubjectBinding {
  subject: string;
  direction: MoneySubjectDirection;
  between: string;
  prefix: string;
  connector?: string;
}

function canonicalMoneySubject(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .replace(/\s+/g, ' ');
  if (cleaned === 'arr') return 'annual recurring revenue';
  if (cleaned === 'mrr') return 'monthly recurring revenue';
  if (/^cash on hand$/.test(cleaned)) return 'cash';
  if (/^cost of sales$/.test(cleaned)) return 'cost of sales';
  if (/^cash balance$/.test(cleaned)) return 'cash balance';

  const tokens = cleaned.split(' ')
    .filter((token, index) => index > 0 || !/^(?:a|an|the|our|your|my)$/.test(token));
  const subject = tokens.pop() ?? '';
  const canonical = /^(?:pricing|prices?)$/.test(subject)
    ? 'price'
    : subject === 'sales'
      ? 'sales'
      : /^loss(?:es)?$/.test(subject)
        ? 'loss'
        : subject === 'cogs'
          ? 'cogs'
          : stem(subject);
  if (canonical === 'burn' && tokens.length === 0) return 'monthly burn';
  return [...tokens, canonical].filter(Boolean).join(' ');
}

const SUBJECT_PHRASE_BODY = String.raw`(?:annual[ \t]+recurring[ \t]+revenue|monthly[ \t]+recurring[ \t]+revenue|cost[ \t]+of[ \t]+sales|cash[ \t]+(?:on[ \t]+hand|balance)|churn[ \t]+rates?|arr|mrr|gmv|${MONEY_QUALIFIED_SUBJECT_BODY}|support)`;
const METRIC_HEAD_RE = new RegExp(
  `\\b(?:${SUBJECT_PHRASE_BODY})\\b`,
  'i',
);
const SUBJECT_RELATION_TAIL_RE = /(?:[,([]?[ \t]*|[ \t]+)\b(?:including|excluding|except(?:ing)?|without|not|rather[ \t]+than|other[ \t]+than|before|after|versus|vs\.?|compared[ \t]+(?:with|to))\b[\s\S]*$/i;
const SUBJECT_BLOCKER_RE = /\b(?:unknown|unavailable|unsupplied|missing|absent|pending|tbd)\b/i;
const GENERIC_SUBJECT_STOP_RE = /^(?:i|we|you|they|he|she|it|this|that|these|those|company|team|there)$/i;

function canonicalPlanName(raw: string): string | undefined {
  const words = raw.trim().toLowerCase().match(/[a-z][a-z0-9-]{0,30}/g) ?? [];
  while (words.length > 0 && /^(?:is|for|a|an|the|our|your|my|their|his|her|its)$/.test(words[0] ?? '')) {
    words.shift();
  }
  while (words.length > 0 && /^(?:is|at)$/.test(words.at(-1) ?? '')) words.pop();
  if (words.length === 0 || words.length > 2) return undefined;
  if (words.some(word => /^(?:a|an|the|our|your|my|their|is|was|are|were|at|for|price|pricing|actual|projected|forecast|forecasted|target|targeted|budgeted|estimated|weekly|monthly|quarterly|annual|annually|yearly)$/.test(word))) {
    return undefined;
  }
  return words.join('-');
}

function canonicalOwnerName(raw: string): string | undefined {
  const match = raw.trim().match(
    /^(?:the[ \t]+)?([a-z][a-z0-9-]*(?:[ \t]+[a-z][a-z0-9-]*){0,2})(?:['’]s)$/i,
  );
  if (!match?.[1]) return undefined;
  const owner = match[1].toLowerCase().replace(/[ \t]+/g, '-');
  return /^(?:our|your|my|their|his|her|its)$/.test(owner) ? undefined : owner;
}

function canonicalSubjectPhrase(raw: string, requireKnownMetric: boolean): string | undefined {
  const trimmed = raw.trim().replace(/^[,:=()[\]\s]+|[,:=()[\]\s]+$/g, '');
  const relation = trimmed.match(SUBJECT_RELATION_TAIL_RE);
  const beforeRelation = relation?.index === undefined ? '' : trimmed.slice(0, relation.index);
  const relationFollowsMetric = relation?.index !== undefined && METRIC_HEAD_RE.test(beforeRelation);
  const pruned = (relationFollowsMetric ? beforeRelation : trimmed).trim()
    .replace(/^[,:=()[\]\s]+|[,:=()[\]\s]+$/g, '');
  if (!pruned) return undefined;

  const candidates = [...pruned.matchAll(new RegExp(`\\b(${SUBJECT_PHRASE_BODY})\\b`, 'gi'))];
  const selected = candidates.at(-1);
  if (selected?.[1]) {
    const selectedIndex = selected.index ?? 0;
    const trailing = pruned.slice(selectedIndex + selected[0].length).trim();
    const selectedSubject = canonicalMoneySubject(selected[1]);
    const leading = pruned.slice(0, selectedIndex).trim();
    const trailingPricingPlan = selectedSubject === 'price'
      ? canonicalPlanName(trailing.replace(/^(?:(?:is|for)[ \t]+|[-–—][ \t]*)/i, ''))
      : undefined;
    const leadingPricingPlan = selectedSubject === 'price'
      ? canonicalPlanName(leading)
      : undefined;
    const pricingPlan = trailingPricingPlan ?? leadingPricingPlan;
    if (trailing && !pricingPlan && !/^(?:later|currently|now|then)$/i.test(trailing)) {
      return undefined;
    }
    if (pricingPlan) return `price:${pricingPlan}`;
    const owner = canonicalOwnerName(leading);
    if (owner) return `owner:${owner}:${selectedSubject}`;
    if (candidates.length > 1) {
      const parts = candidates.map(candidate => canonicalMoneySubject(candidate[1]));
      let connector: string | undefined;
      let validList = true;
      for (let index = 1; index < candidates.length; index += 1) {
        const previous = candidates[index - 1];
        const current = candidates[index];
        const between = pruned.slice(
          (previous.index ?? 0) + previous[0].length,
          current.index ?? 0,
        ).trim();
        const separator = between.match(/^(?:,[ \t]*)?(?:(and|or)[ \t]*)?$/i);
        if (!separator) {
          validList = false;
          break;
        }
        const currentConnector = separator[1]?.toLowerCase();
        if (currentConnector && connector && connector !== currentConnector) {
          validList = false;
          break;
        }
        connector = currentConnector ?? connector;
      }
      if (validList && connector) return `compound:${connector}:${parts.sort().join('+')}`;
    }
    return selectedSubject;
  }

  if (requireKnownMetric || SUBJECT_BLOCKER_RE.test(pruned)) return undefined;
  const tokens = pruned.match(/[a-z][a-z0-9-]{0,30}/gi) ?? [];
  while (tokens.length > 0 && /^(?:and|but|while|whereas|a|an|the|our|your|their)$/i.test(tokens[0] ?? '')) {
    tokens.shift();
  }
  while (tokens.length > 0 && /^(?:later|currently|now|then)$/i.test(tokens.at(-1) ?? '')) {
    tokens.pop();
  }
  if (tokens.length === 0 || tokens.length > 4 || GENERIC_SUBJECT_STOP_RE.test(tokens[0] ?? '')) {
    return undefined;
  }
  const canonical = canonicalMoneySubject(tokens.join(' '));
  return canonical || undefined;
}

function subjectCompatible(expected: string, actual: string): boolean {
  return expected === actual || actual === `actual ${expected}`;
}

function bindingSubjectIdentity(binding: MoneySubjectBinding): string {
  let subject = binding.subject;
  if (subject === 'price') {
    const betweenPlan = binding.between.match(
      /^[ \t]*(?::|for|[-–—])[ \t]*([a-z][a-z0-9-]*(?:[ \t]+[a-z][a-z0-9-]*)?)(?:[ \t]+(?:is|at)|[ \t]*[-–—])?[ \t]*(?:(?:usd|dollars?|foreign)[ \t]+)?\$?[ \t]*$/i,
    )?.[1];
    const prefixPlan = binding.prefix.match(
      /([a-z][a-z0-9-]*(?:[ \t]+[a-z][a-z0-9-]*)?)[ \t]*$/i,
    )?.[1];
    const plan = canonicalPlanName(betweenPlan ?? prefixPlan ?? '');
    if (plan) subject = `price:${plan}`;
  }
  if (/\b(?:rose|grew|fell|increased|decreased|dropped|declined|improved)\b(?![ \t]+to\b)/i.test(binding.between)) {
    subject = `delta:${subject}`;
  }
  return subject;
}

function clauseTail(raw: string): { text: string; offset: number } {
  let offset = 0;
  const relationStart = raw.search(SUBJECT_RELATION_TAIL_RE);
  for (const match of raw.matchAll(/(?:^|[ \t])(?:and|but|while|whereas)[ \t]+|:/gi)) {
    const separator = match[0].trim().toLowerCase();
    if (separator === 'and' && relationStart >= 0 && (match.index ?? 0) >= relationStart) continue;
    if (separator === 'and') {
      const connectorStart = match.index ?? 0;
      const beforeConnector = raw.slice(0, connectorStart);
      const afterConnector = raw.slice(connectorStart + match[0].length);
      if (METRIC_HEAD_RE.test(beforeConnector) && METRIC_HEAD_RE.test(afterConnector)) continue;
    }
    offset = (match.index ?? 0) + match[0].length;
  }
  return { text: raw.slice(offset), offset };
}

function prefixSubjectBinding(before: string): MoneySubjectBinding | undefined {
  const valuePrefix = before.match(new RegExp(
    `(?:(?:\\b(?:${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|foreign)[ \\t]+)\\$?|\\$)[ \\t]*$`,
    'i',
  ))?.[0] ?? '';
  const subjectBefore = valuePrefix ? before.slice(0, -valuePrefix.length) : before;
  const predicate = /\b(?:(?:is|was|are|were)(?:[ \t]+(?:about|approximately|around|roughly|estimated(?:[ \t]+at)?))?|equals?|totals?|totaled|recorded|reported|stands?(?:[ \t]+at)?|(?:has|had)(?:[ \t]+not)?[ \t]+reached|reached|rose(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|grew(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|increased(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|decreased(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|dropped(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|improved(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|declined(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|fell(?:[ \t]+(?:by|to))?(?:[ \t]+(?:about|approximately|around|roughly))?|came[ \t]+in[ \t]+at|estimated(?:[ \t]+at)?|at|of)\b(?:[ \t]+(?:not|never|unknown|unavailable|missing|absent|pending))?[ \t]*[:=]?[ \t]*$/i;
  const symbolLink = /[:=][ \t]*$/;
  const predicateMatch = subjectBefore.match(predicate) ?? subjectBefore.match(symbolLink);
  if (predicateMatch) {
    const predicateStart = predicateMatch.index ?? 0;
    const subjectRegion = subjectBefore.slice(0, predicateStart);
    const structuredLabel = subjectRegion.match(/^[ \t]*([^:\r\n]{1,40}):/);
    const structuredSubject = structuredLabel?.[1]
      ? canonicalSubjectPhrase(structuredLabel[1], true)
      : undefined;
    const region = clauseTail(subjectRegion);
    const rawSubject = region.text;
    const subject = structuredSubject ?? canonicalSubjectPhrase(rawSubject, false);
    if (!subject) return undefined;
    const knownSubject = [...rawSubject.matchAll(new RegExp(`\\b(${SUBJECT_PHRASE_BODY})\\b`, 'gi'))].at(-1);
    const structuredSubjectStart = structuredLabel?.[1]
      ? (structuredLabel.index ?? 0) + structuredLabel[0].indexOf(structuredLabel[1])
      : 0;
    const subjectStart = structuredSubject && structuredLabel
      ? structuredSubjectStart
      : region.offset + (knownSubject?.index ?? 0);
    const colonIndex = structuredLabel?.[0].lastIndexOf(':') ?? -1;
    const subjectEnd = structuredSubject && structuredLabel
      ? (structuredLabel.index ?? 0) + colonIndex
      : knownSubject
        ? region.offset + (knownSubject.index ?? 0) + knownSubject[0].length
        : predicateStart;
    return {
      subject,
      direction: 'before',
      between: `${subjectBefore.slice(subjectEnd)}${valuePrefix}`,
      prefix: subjectBefore.slice(0, subjectStart),
    };
  }

  const pricingPlan = subjectBefore.match(/^([a-z][a-z0-9 -]{0,30})\s*:\s*[^:]{1,24}(?:[-–—]|at)?\s*$/i);
  if (pricingPlan?.[1]) {
    const subject = canonicalSubjectPhrase(pricingPlan[1], true);
    if (subject) {
      return {
        subject,
        direction: 'before',
        between: `${subjectBefore.slice(pricingPlan[1].length)}${valuePrefix}`,
        prefix: '',
      };
    }
  }

  const bareRegion = clauseTail(subjectBefore);
  const bare = bareRegion.text.match(/([a-z][a-z0-9-]*(?:[ \t]+[a-z][a-z0-9-]*){0,5})[ \t]*$/i);
  const subject = bare?.[1] ? canonicalSubjectPhrase(bare[1], true) : undefined;
  if (!subject || !bare) return undefined;
  const bareStart = bareRegion.offset + (bare.index ?? 0);
  return {
    subject,
    direction: 'before',
    between: `${subjectBefore.slice(bareStart + bare[1].length)}${valuePrefix}`,
    prefix: subjectBefore.slice(0, bareStart),
  };
}

function postfixSubjectBinding(after: string, prefix: string): (MoneySubjectBinding & { strong: boolean }) | undefined {
  if (/^[ \t]*(?:and|but|while|whereas|for)\b/i.test(after)) return undefined;
  const match = after.match(new RegExp(
    `^[ \\t]*(?:(?:dollars?|usd)[ \\t]+)?(?:(is|equals?|in|of|as)[ \\t]+)?((?:${MONEY_SUBJECT_QUALIFIER_BODY})[ \\t]+)?([a-z][a-z0-9-]*(?:[ \\t]+(?:of[ \\t]+)?[a-z][a-z0-9-]*){0,4})`,
    'i',
  ));
  if (!match?.[3]) return undefined;
  const connector = match[1]?.toLowerCase();
  if (connector === 'for') return undefined;
  const rawSubject = `${match[2] ?? ''}${match[3]}`;
  const subject = canonicalSubjectPhrase(rawSubject, true);
  if (!subject) return undefined;
  const subjectOffset = match[0].toLowerCase().lastIndexOf(match[3].toLowerCase())
    - (match[2]?.length ?? 0);
  return {
    subject,
    direction: 'after',
    between: after.slice(0, Math.max(0, subjectOffset)),
    prefix,
    connector,
    strong: !connector || /^(?:is|equal)/.test(connector),
  };
}

function moneySubjectBinding(
  text: string,
  start: number,
  end: number,
  allowBeforeLineBreak: boolean,
): MoneySubjectBinding | undefined {
  const beforeWindow = text.slice(Math.max(0, start - 96), start);
  const hardBoundary = Math.max(
    beforeWindow.lastIndexOf(';'),
    beforeWindow.lastIndexOf('.'),
    beforeWindow.lastIndexOf('!'),
    beforeWindow.lastIndexOf('?'),
    beforeWindow.lastIndexOf('\n'),
    allowBeforeLineBreak ? -1 : beforeWindow.lastIndexOf('\r'),
  );
  let before = beforeWindow.slice(hardBoundary + 1);
  const after = text.slice(end, Math.min(text.length, end + 64)).split(/[;.!?\r\n]/)[0] ?? '';
  const postfix = postfixSubjectBinding(after, before);
  if (postfix?.strong) return postfix;

  let prefix = prefixSubjectBinding(before);
  const markerOnlyLine = new RegExp(
    `^[ \\t]*(?:-[ \\t]*)?(?:(?:${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|foreign)[ \\t]+)?\\$?[ \\t]*$`,
    'i',
  ).test(before);
  if (!prefix && allowBeforeLineBreak && markerOnlyLine) {
    const previous = beforeWindow.slice(0, hardBoundary)
      .split(/\r?\n/).at(-1)?.trim() ?? '';
    const label = previous.replace(/[:=]$/, '').trim();
    const subject = MONEY_FACT_BLOCKER_RE.test(label) || SUBJECT_BLOCKER_RE.test(label)
      ? undefined
      : canonicalSubjectPhrase(label, !/[:=]$/.test(previous));
    if (subject) {
      before = previous;
      prefix = { subject, direction: 'before', between: '\n', prefix: '' };
    }
  }
  if (prefix) return prefix;
  return postfix;
}

function moneySubject(text: string, start: number, end: number): string | undefined {
  const binding = moneySubjectBinding(text, start, end, true);
  const after = text.slice(end, Math.min(text.length, end + 8));
  if (binding?.direction === 'before'
    && !METRIC_HEAD_RE.test(binding.subject)
    && /^\s*[-+*/×÷−]/.test(after)) {
    return undefined;
  }
  return binding ? bindingSubjectIdentity(binding) : undefined;
}

function normalizeGroundingSources(sources: string): string {
  return normalizeGroundingText(sources)
    .toLowerCase()
    .replace(
      SUBJECT_ZERO_RE,
      (match, subject: string, middle: string) => MONEY_FACT_BLOCKER_RE.test(middle)
        ? match
        : `${subject}${middle}0`,
    )
    .replace(
      ZERO_SUBJECT_RE,
      (match, negation: string | undefined, suffix: string) => negation ? match : `0${suffix}`,
    )
    .replace(FOREIGN_MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      const currency = moneyCurrencyAt(input, offset, offset + match.length) ?? 'foreign';
      const leadingSpace = /^[ \t]/.test(match) ? ' ' : '';
      return `${leadingSpace}${currency} $${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(USD_PREFIX_MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      return `$${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(LINKED_CURRENCY_MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      const currency = moneyCurrencyAt(input, offset, offset + match.length) ?? 'foreign';
      return `${currency} $${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(COMPACT_FOREIGN_SUFFIX_MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      const currency = moneyCurrencyAt(input, offset, offset + match.length) ?? 'foreign';
      return `${currency} $${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(COMPACT_ISO_PREFIX_MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      const currency = moneyCurrencyAt(input, offset, offset + match.length) ?? 'foreign';
      return `${currency === 'usd' ? '' : `${currency} `}$${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(COMPACT_ISO_SUFFIX_MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      const currency = moneyCurrencyAt(input, offset, offset + match.length) ?? 'foreign';
      return `${currency === 'usd' ? '' : `${currency} `}$${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      const number = moneyNumber(input, offset, match);
      const detachedSeparator = /^[ \t]*[-−]/.test(match) && !number.startsWith('-') ? ' ' : '';
      return `${detachedSeparator}$${number}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(BARE_MONEY_CADENCE_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      const currency = new RegExp(`\\b${MONEY_CURRENCY_BODY}\\b`, 'i').test(match) ? '$' : '';
      return `${currency}${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(BARE_MONEY_RE, (match, offset: number, input: string) => {
      const cadence = moneyCadenceAt(input, offset, match);
      return `$${moneyNumber(input, offset, match)}${cadence ? `/${cadence}` : ''} `;
    })
    .replace(MAGNITUDE_NUMBER_RE, (match, offset: number, input: string) => {
      const number = moneyNumber(input, offset, match);
      const detachedSeparator = /^[ \t]*[-−]/.test(match) && !number.startsWith('-') ? ' ' : '';
      return `${detachedSeparator}${number} `;
    });
}

function hasConflictingMoneyContext(
  text: string,
  start: number,
  end: number,
  expectedCurrency: string,
  expectedCadence?: MoneyCadence,
  checkPrefixUnit = false,
): boolean {
  if (/^[a-z]/i.test(text.slice(end))) return true;
  const actualCurrency = moneyCurrencyAt(text, start, end);
  const currencyMatches = expectedCurrency === 'usd'
    ? actualCurrency === undefined || actualCurrency === 'usd'
    : actualCurrency === expectedCurrency;
  if (!currencyMatches) return true;

  if (checkPrefixUnit) {
    const prefix = text.slice(Math.max(0, start - 40), start);
    const previousWord = prefix.match(
      /\b([a-z][a-z-]{0,30})[ \t]*(?:[$€£¥₹₽₩][ \t]*)?$/i,
    )?.[1];
    if (previousWord) {
      const prefixCurrency = canonicalCurrencyToken(previousWord);
      if (prefixCurrency && prefixCurrency !== expectedCurrency) return true;
      if (!prefixCurrency
        && !MONEY_SUBJECT_TOKEN_RE.test(previousWord)
        && !MONEY_ALLOWED_PRECEDING_WORD_RE.test(previousWord)) {
        return true;
      }
    }
  }

  let suffix = text.slice(end, Math.min(text.length, end + 48));
  if (/^[ \t]*(?:_|\d|[-+−][ \t]*\d)/.test(suffix)) return true;
  const currencySuffix = suffix.match(
    new RegExp(`^[ \\t]*(${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY})\\b`, 'i'),
  );
  if (currencySuffix?.[1]) {
    const suffixCurrency = canonicalCurrencyToken(currencySuffix[1]);
    if (suffixCurrency && suffixCurrency !== expectedCurrency) return true;
    suffix = suffix.slice(currencySuffix[0].length);
  }

  if (expectedCadence) {
    const duplicateCadence = suffix.match(new RegExp(
      `^[ \\t]*(?:,[ \\t]*)?(?:\\([ \\t]*)?(${MONEY_DIRECT_CADENCE})(?:[ \\t]*\\))?`,
      'i',
    ));
    if (duplicateCadence?.[1] && moneyCadence(duplicateCadence[1]) === expectedCadence) {
      suffix = suffix.slice(duplicateCadence[0].length);
    }
  }

  if (MONEY_CONFLICTING_SUFFIX_RE.test(suffix)) return true;
  const slashUnit = suffix.match(/^[ \t]*\/[ \t]*([a-z]+)/i)?.[1];
  if ((slashUnit && !/^(?:weeks?|wks?|months?|mos?|quarters?|qtrs?|years?|yrs?|seats?|users?)$/i.test(slashUnit))
    || /^[ \t]*(?:-[ \t]*[a-z]|\([ \t]*[a-z]|\[[ \t]*[a-z]|:[ \t]*[a-z])/i.test(suffix)) {
    return true;
  }

  const suffixWords = suffix.match(
    /^[ \t]+([a-z][a-z-]{0,30})(?:[ \t]+([a-z][a-z-]{0,30}))?(?:[ \t]+([a-z][a-z-]{0,30}))?/i,
  );
  const firstWord = suffixWords?.[1];
  if (!firstWord) return false;
  if (MONEY_SUBJECT_TOKEN_RE.test(firstWord)) {
    const trailingWord = suffixWords?.[2];
    if (!trailingWord || MONEY_ALLOWED_FOLLOWING_WORD_RE.test(trailingWord)) return false;
    if (/^(?:in|of|as)$/i.test(trailingWord)) {
      const linkedCurrency = canonicalCurrencyToken(suffixWords?.[3] ?? '');
      return linkedCurrency !== expectedCurrency;
    }
    return true;
  }

  if (/^(?:in|of|for|as|total)$/i.test(firstWord)) {
    let linkedWord = suffixWords?.[2];
    if (linkedWord && /^(?:weekly|monthly|quarterly|annual|yearly)$/i.test(linkedWord)) {
      linkedWord = suffixWords?.[3];
    } else if (linkedWord?.toLowerCase() === 'total') {
      linkedWord = suffixWords?.[3];
    }
    if (!linkedWord || MONEY_SUBJECT_TOKEN_RE.test(linkedWord)) return false;
    const linkedCurrency = canonicalCurrencyToken(linkedWord);
    return linkedCurrency ? linkedCurrency !== expectedCurrency : true;
  }

  return !MONEY_ALLOWED_FOLLOWING_WORD_RE.test(firstWord);
}

function isAssertiveSourceOccurrence(text: string, start: number, end: number): boolean {
  const beforeWindow = text.slice(Math.max(0, start - 160), start);
  const sentenceBoundary = Math.max(
    beforeWindow.lastIndexOf(';'),
    beforeWindow.lastIndexOf('.'),
    beforeWindow.lastIndexOf('!'),
    beforeWindow.lastIndexOf('?'),
    beforeWindow.lastIndexOf('\n'),
    beforeWindow.lastIndexOf('\r'),
  );
  const sentenceBefore = beforeWindow.slice(sentenceBoundary + 1);
  let boundary = Math.max(
    beforeWindow.lastIndexOf(';'),
    beforeWindow.lastIndexOf('.'),
    beforeWindow.lastIndexOf('!'),
    beforeWindow.lastIndexOf('?'),
    beforeWindow.lastIndexOf('\n'),
    beforeWindow.lastIndexOf('\r'),
    beforeWindow.lastIndexOf(','),
  );
  const colon = beforeWindow.lastIndexOf(':');
  if (colon > boundary) {
    const afterColon = beforeWindow.slice(colon + 1);
    if (METRIC_HEAD_RE.test(afterColon)
      && /\b(?:is|was|are|were|equals?|totals?|totaled|recorded|reported|stands?|reached|at)\b/i.test(afterColon)) {
      boundary = colon;
    }
  }
  for (const connector of beforeWindow.matchAll(/\b(?:and|but|while|whereas)\b|[–—]/gi)) {
    const connectorEnd = (connector.index ?? 0) + connector[0].length;
    boundary = Math.max(boundary, connectorEnd - 1);
  }
  const before = beforeWindow.slice(boundary + 1);
  const afterWindow = text.slice(end, Math.min(text.length, end + 160));
  if (afterWindow.match(/[.!?\r\n]/)?.[0] === '?') return false;
  const terminator = afterWindow.match(/[;.!?\r\n,]|\b(?:and|but|while|whereas)\b/i);
  const after = terminator?.index === undefined ? afterWindow : afterWindow.slice(0, terminator.index);
  const clause = `${before}${after}`;
  if (terminator?.[0] === '?') return false;
  const nonassertiveMarker = /\b(?:if|unless|whether|assume|assuming|suppose|supposing|hypothetical(?:ly)?|for[ \t]+(?:example|instance)|examples?)\b/i;
  const leadingNonassertiveMarker = /^[ \t]*(?:if|unless|whether|assume|assuming|suppose|supposing|hypothetical(?:ly)?|for[ \t]+(?:example|instance)|examples?)\b/i;
  const contrasts = [...sentenceBefore.matchAll(/\b(?:but|however|yet|whereas)\b/gi)];
  const contrast = contrasts.at(-1);
  const leadingScope = contrast
    ? sentenceBefore.slice((contrast.index ?? 0) + contrast[0].length)
    : sentenceBefore;
  if (leadingNonassertiveMarker.test(leadingScope) || nonassertiveMarker.test(before)) {
    return false;
  }
  if (MONEY_FACT_BLOCKER_RE.test(clause)) return false;
  return !/(?:[<>]=?|[≤≥])[ \t]*$/.test(before);
}

function hasAssertiveMatch(text: string, pattern: string): boolean {
  for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
    const start = match.index ?? 0;
    if (isAssertiveSourceOccurrence(text, start, start + match[0].length)) return true;
  }
  return false;
}

function hasSubjectBoundMoney(
  normalizedSources: string,
  expectedSubject: string,
  standaloneNumber: string,
  expectedCurrency: string,
  expectedCadence?: MoneyCadence,
): boolean {
  const canonicalExpectedSubject = expectedSubject;
  const numbers = normalizedSources.matchAll(new RegExp(standaloneNumber, 'g'));

  for (const numberMatch of numbers) {
    const numberStart = numberMatch.index ?? 0;
    const numberEnd = numberStart + numberMatch[0].length;
    if (!isAssertiveSourceOccurrence(normalizedSources, numberStart, numberEnd)) continue;
    const binding = moneySubjectBinding(normalizedSources, numberStart, numberEnd, true);
    if (!binding || !subjectCompatible(canonicalExpectedSubject, bindingSubjectIdentity(binding))) continue;
    if (hasConflictingMoneyContext(
      normalizedSources,
      numberStart,
      numberEnd,
      expectedCurrency,
      expectedCadence,
      binding.direction === 'after',
    )) {
      continue;
    }
    const currentFactPrefix = binding.prefix
      .split(/\r?\n|\b(?:and|but|while|whereas)\b|[,:–—]/i)
      .at(-1) ?? binding.prefix;

    if (binding.direction === 'before') {
      const pricingPlanLink = canonicalExpectedSubject.startsWith('price')
        && PRICING_PLAN_LINK_RE.test(binding.between);
      if (binding.between.length <= 32
        && (MONEY_FORWARD_LINK_RE.test(binding.between) || pricingPlanLink)
        && !MONEY_SUBJECT_TOKEN_RE.test(binding.between)
        && !MONEY_FACT_BLOCKER_RE.test(binding.between)
        && !MONEY_FACT_BLOCKER_RE.test(currentFactPrefix)) {
        return true;
      }
      continue;
    }

    const weakPostfix = Boolean(binding.connector && binding.connector !== 'is');
    const weakPostfixAllowed = !weakPostfix
      || (binding.connector !== 'for' && !MONEY_SUBJECT_TOKEN_RE.test(currentFactPrefix));
    if (weakPostfixAllowed
      && MONEY_REVERSE_LINK_RE.test(binding.between)
      && !MONEY_FACT_BLOCKER_RE.test(binding.between)
      && !MONEY_FACT_BLOCKER_RE.test(currentFactPrefix)) {
      return true;
    }
  }

  return false;
}

function hasCurrencyBoundMoney(
  normalizedSources: string,
  standaloneNumber: string,
  expectedCurrency: string,
  expectedCadence?: MoneyCadence,
): boolean {
  for (const match of normalizedSources.matchAll(new RegExp(standaloneNumber, 'g'))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (!isAssertiveSourceOccurrence(normalizedSources, start, end)) continue;
    if (!moneyCurrencyAt(normalizedSources, start, end)) continue;
    if (!hasConflictingMoneyContext(normalizedSources, start, end, expectedCurrency, expectedCadence, true)) {
      return true;
    }
  }
  return false;
}

function hasSubjectBoundQuantitative(
  normalizedSources: string,
  expectedSubject: string,
  valuePattern: string,
): boolean {
  for (const match of normalizedSources.matchAll(new RegExp(valuePattern, 'g'))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (!isAssertiveSourceOccurrence(normalizedSources, start, end)) continue;
    const binding = moneySubjectBinding(normalizedSources, start, end, true);
    if (!binding || !subjectCompatible(expectedSubject, bindingSubjectIdentity(binding))) continue;
    const currentFactPrefix = binding.prefix
      .split(/\r?\n|\b(?:and|but|while|whereas)\b|[,:–—]/i)
      .at(-1) ?? binding.prefix;
    if (MONEY_FACT_BLOCKER_RE.test(binding.between)
      || MONEY_FACT_BLOCKER_RE.test(currentFactPrefix)) {
      continue;
    }
    if (binding.direction === 'before'
      ? binding.between.length <= 32 && MONEY_FORWARD_LINK_RE.test(binding.between)
      : MONEY_REVERSE_LINK_RE.test(binding.between)) {
      return true;
    }
  }
  return false;
}

/** Extract quantitative specifics worth grounding from `text`. */
export function extractClaimedSpecifics(text: string): ClaimedSpecific[] {
  const searchableText = normalizeGroundingText(text);
  const out: ClaimedSpecific[] = [];
  const seen = new Set<string>();
  const push = (s: ClaimedSpecific): void => {
    const key = `${s.kind}:${s.number}:${s.unit}:${s.subject ?? ''}:${s.cadence ?? ''}:${s.currency ?? ''}`;
    if (!seen.has(key)) { seen.add(key); out.push(s); }
  };
  const magnitudeCountMatches = [...searchableText.matchAll(COUNT_MAGNITUDE_RE)]
    .filter(match => {
      const start = match.index ?? 0;
      return STAT_NOUNS.includes((match[3] ?? '').toLowerCase())
        && !hasMalformedQuantitativeBoundary(text, start, start + match[0].length);
    });
  const magnitudeCountRanges = magnitudeCountMatches.map(match => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  const moneyCandidates = [
    ...searchableText.matchAll(MONEY_RE),
    ...searchableText.matchAll(FOREIGN_MONEY_RE),
    ...searchableText.matchAll(USD_PREFIX_MONEY_RE),
    ...searchableText.matchAll(COMPACT_FOREIGN_SUFFIX_MONEY_RE),
    ...searchableText.matchAll(LINKED_CURRENCY_MONEY_RE),
    ...searchableText.matchAll(BARE_MONEY_CADENCE_RE),
    ...searchableText.matchAll(BARE_MONEY_RE),
    ...searchableText.matchAll(COMPACT_ISO_PREFIX_MONEY_RE),
    ...searchableText.matchAll(COMPACT_ISO_SUFFIX_MONEY_RE),
    ...searchableText.matchAll(MAGNITUDE_NUMBER_RE),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0)
    || right[0].length - left[0].length);
  const moneyMatches: RegExpMatchArray[] = [];
  for (const candidate of moneyCandidates) {
    const start = candidate.index ?? 0;
    const end = start + candidate[0].length;
    const selected = moneyMatches.at(-1);
    const selectedStart = selected?.index ?? 0;
    const selectedEnd = selected ? selectedStart + selected[0].length : 0;
    if (!selected || start >= selectedEnd || end <= selectedStart) {
      moneyMatches.push(candidate);
    } else if (candidate[0].length > selected[0].length) {
      moneyMatches[moneyMatches.length - 1] = candidate;
    }
  }
  moneyMatches.sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  const commentRanges = codeCommentRanges(searchableText);
  let commentRangeIndex = 0;
  let magnitudeRangeIndex = 0;
  for (const m of moneyMatches) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (hasMalformedQuantitativeBoundary(text, start, end)) continue;
    while (commentRanges[commentRangeIndex]?.end <= start) commentRangeIndex += 1;
    const commentRange = commentRanges[commentRangeIndex];
    if (commentRange && commentRange.start <= start && start < commentRange.end) continue;
    while (magnitudeCountRanges[magnitudeRangeIndex]?.end <= start) magnitudeRangeIndex += 1;
    const magnitudeRange = magnitudeCountRanges[magnitudeRangeIndex];
    if (magnitudeRange && magnitudeRange.start < end && start < magnitudeRange.end) continue;
    const originalBefore = text[start - 1] ?? '';
    const originalAfter = text[end] ?? '';
    const detachedSign = /^[-−]/.test(m[0])
      && !moneyNumber(searchableText, start, m[0]).startsWith('-');
    if ((/[a-z0-9_]/i.test(originalBefore) && !detachedSign)
      || /[a-z0-9_]/i.test(originalAfter)) continue;
    const subject = moneySubject(searchableText, start, end);
    const cadence = moneyCadenceAt(searchableText, start, m[0]);
    const magnitude = new RegExp(`\\b${MONEY_MAGNITUDE_BODY}\\b`, 'i').test(m[0]);
    const alphabeticCurrency = new RegExp(
      `\\b(?:${MONEY_CURRENCY_BODY}|${NON_USD_CURRENCY_CODE_BODY}|${NON_USD_CURRENCY_NAME_BODY})\\b`,
      'i',
    ).test(m[0]);
    if (alphabeticCurrency && !/[$€£¥₹₽₩]/.test(m[0]) && !subject && !cadence) continue;
    const alphabeticCode = new RegExp(
      `\\b${ISO_CURRENCY_CODE_BODY}\\b|\\b${ISO_CURRENCY_CODE_BODY}(?=\\d)|(?<=\\d)${ISO_CURRENCY_CODE_BODY}\\b`,
      'i',
    ).test(m[0]);
    if (alphabeticCode && !/[$€£¥₹₽₩]/.test(m[0]) && !magnitude && !cadence) {
      const beforeClause = searchableText.slice(Math.max(0, start - 80), start)
        .split(/[;.!?\r\n]/).at(-1) ?? '';
      const afterClause = searchableText.slice(end, Math.min(searchableText.length, end + 48));
      const codeTerminated = /^[ \t]*(?:(?:\/\/|\/\*|#|--)|[;}\r\n]|$)/.test(afterClause);
      if (CODE_DECLARATION_ASSIGNMENT_RE.test(beforeClause)
        || (codeTerminated && (CODE_BARE_ASSIGNMENT_RE.test(beforeClause)
          || CODE_OBJECT_PROPERTY_ASSIGNMENT_RE.test(beforeClause)))) continue;
      const strongPrefix = new RegExp(
        `\\b(?:${SUBJECT_PHRASE_BODY})[ \\t]*(?:is|was|are|were|equals?|totals?|stands?(?:[ \\t]+at)?|at|[:=])[ \\t]*(?:[-+−][ \\t]*)?$`,
        'i',
      ).test(beforeClause);
      const strongPostfix = new RegExp(
        `^[ \\t]*(?:is|equals?)[ \\t]+(?:${SUBJECT_PHRASE_BODY})\\b`,
        'i',
      ).test(afterClause);
      if (!strongPrefix && !strongPostfix) continue;
    }
    if (!moneyCurrencyAt(searchableText, start, end) && magnitude && !subject) continue;
    push({
      text: text.slice(start, end).trim(),
      kind: 'money',
      number: moneyNumber(searchableText, start, m[0]),
      unit: 'money',
      subject,
      cadence,
      currency: moneyCurrencyAt(searchableText, start, end) ?? 'usd',
    });
  }
  for (const m of searchableText.matchAll(PERCENT_RE)) {
    const start = m.index ?? 0;
    if (hasMalformedQuantitativeBoundary(text, start, start + m[0].length)) continue;
    const marker = (m[2] ?? m[4])?.toLowerCase() ?? '%';
    push({
      text: text.slice(start, start + m[0].length).trim(),
      kind: 'percent',
      number: quantitativeNumber(text, start, m[0]),
      unit: /^(?:pp|percentage)/.test(marker) ? 'percentage-point' : 'percent',
      subject: moneySubject(searchableText, start, start + m[0].length),
    });
  }
  for (const m of searchableText.matchAll(DURATION_RE)) {
    const start = m.index ?? 0;
    if (hasMalformedQuantitativeBoundary(text, start, start + m[0].length)) continue;
    push({
      text: text.slice(start, start + m[0].length).trim(),
      kind: 'duration',
      number: quantitativeNumber(text, start, m[0]),
      unit: m[2]?.toLowerCase().replace(/s$/, '') ?? 'duration',
    });
  }
  for (const m of searchableText.matchAll(COUNT_RE)) {
    const noun = m[2].toLowerCase();
    if (STAT_NOUNS.includes(noun)) {
      const start = m.index ?? 0;
      if (hasMalformedQuantitativeBoundary(text, start, start + m[0].length)) continue;
      push({
        text: text.slice(start, start + m[0].length).trim(),
        kind: 'count',
        number: quantitativeNumber(text, start, m[0]),
        unit: stem(noun),
      });
    }
  }
  for (const m of magnitudeCountMatches) {
    const noun = (m[3] ?? '').toLowerCase();
    const start = m.index ?? 0;
    push({
      text: text.slice(start, start + m[0].length).trim(),
      kind: 'count',
      number: quantitativeNumber(text, start, m[0]),
      unit: stem(noun),
    });
  }
  return out;
}

/**
 * Is a specific grounded in the sources? A specific is grounded when its number
 * appears in the sources AND (for counts/durations) its unit stem appears too —
 * so "$19/month" present in memory grounds, while "4 months runway" (no "4
 * month" in memory) does not. Conservative: a number absent from sources is the
 * strong confabulation signal.
 */
function isGrounded(s: ClaimedSpecific, normalizedSources: string): boolean {
  if (!s.number) return true; // nothing numeric to verify
  // Match the number as a STANDALONE number — not a digit inside a longer
  // number (e.g. "4" must NOT match inside "49"). Escape any decimal point.
  const n = s.number.replace(/\./g, '\\.');
  const leftBoundary = s.number.startsWith('-') ? '(?<![\\w.])' : '(?<![-\\w.])';
  const standalone = `${leftBoundary}${n}(?!\\w|\\.\\d|[ \\t]*(?:_|[-+−][ \\t]*\\d))`;
  if (s.kind === 'money') {
    const moneyValue = `${standalone}${s.cadence ? `\\s*\\/\\s*${s.cadence}\\b` : ''}`;
    const currency = s.currency ?? 'usd';
    if (s.subject) {
      return hasSubjectBoundMoney(normalizedSources, s.subject, moneyValue, currency, s.cadence);
    }
    return hasCurrencyBoundMoney(normalizedSources, moneyValue, currency, s.cadence);
  }
  if (s.kind === 'percent') {
    const marker = s.unit === 'percentage-point'
      ? '(?:percentage[ \\t]+points?\\b|pp\\b)'
      : '(?:%(?![%a-z])|per[ \\t]+cent\\b|pct\\b|percent\\b)';
    const percentValue = s.number.startsWith('-')
      ? `(?:${standalone}\\s*${marker}|\\([ \\t]*${s.number.slice(1).replace(/\\./g, '\\\\.')}[ \\t]*${marker}[ \\t]*\\))`
      : `${standalone}\\s*${marker}`;
    return s.subject
      ? hasSubjectBoundQuantitative(normalizedSources, s.subject, percentValue)
      : hasAssertiveMatch(normalizedSources, percentValue);
  }
  // count/duration: require the number ADJACENT to its unit stem in the sources
  // (either order), so "4 months" only grounds if "4 month(s)" actually appears —
  // not a stray standalone "4" plus a stray "month" elsewhere.
  const unit = s.unit.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!unit) return hasAssertiveMatch(normalizedSources, standalone);
  const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inflectedUnit = unit.endsWith('y')
    ? `${escapedUnit.slice(0, -1)}(?:y|ies)`
    : `${escapedUnit}s?`;
  const unitToken = `\\b${inflectedUnit}\\b`;
  const numThenUnit = `${standalone}(?:[ \\t-]+|[ \\t]+[a-z-]{1,3}[ \\t]+)${unitToken}`;
  const unitThenNum = `${unitToken}[ \\t]*(?::|=)?[ \\t]*${standalone}`;
  return hasAssertiveMatch(normalizedSources, numThenUnit)
    || hasAssertiveMatch(normalizedSources, unitThenNum);
}

/**
 * Check a reply's quantitative specifics against the grounding sources
 * (recalled memory + user message + conversation). Pure + deterministic.
 */
export function checkGrounding(reply: string, sources: string): GroundingResult {
  const specifics = extractClaimedSpecifics(reply);
  const normalizedSources = normalizeGroundingSources(sources);
  const grounded: ClaimedSpecific[] = [];
  const ungrounded: ClaimedSpecific[] = [];
  for (const s of specifics) {
    (isGrounded(s, normalizedSources) ? grounded : ungrounded).push(s);
  }
  const score = specifics.length === 0 ? 1 : grounded.length / specifics.length;
  return { specifics, grounded, ungrounded, score };
}

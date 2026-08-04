/**
 * Locale-tolerant numeric normalization for deterministic quantitative checks.
 *
 * This module deliberately does not use Number/parseFloat: values used for
 * grounding can exceed JavaScript's safe integer range and must compare by
 * their exact decimal representation.
 */

const MAX_INTEGER_DIGITS = 30;
const MAX_FRACTION_DIGITS = 12;
const MASK = '\uFFFD';

function normalizedDigit(char: string | undefined): string | undefined {
  if (!char) return undefined;
  if (char >= '0' && char <= '9') return char;
  const code = char.charCodeAt(0);
  return code >= 0xff10 && code <= 0xff19
    ? String.fromCharCode(0x30 + code - 0xff10)
    : undefined;
}

const isDigit = (char: string | undefined): boolean => normalizedDigit(char) !== undefined;
const isHorizontalSpace = (char: string): boolean => char === '\t' || /\p{Zs}/u.test(char);
const isTightSeparator = (char: string): boolean => (
  char === ',' || char === '.' || char === '，' || char === '．'
  || char === "'" || char === '\u2019'
);
const normalizedSeparator = (char: string): string => (
  isHorizontalSpace(char)
    ? ' '
    : char === '\u2019'
      ? "'"
      : char === '，'
        ? ','
        : char === '．'
          ? '.'
           : char
);

function normalizedQuantitativeSymbol(char: string): string {
  if (char === '\uFF04') return '$';
  if (char === '\uFF05') return '%';
  if (char === '\uFF0B') return '+';
  if (char === '\uFF0D' || char === '\u2212') return '-';
  return char;
}

function isWesternGrouping(groups: readonly string[]): boolean {
  return groups.length >= 2
    && groups[0].length >= 1
    && groups[0].length <= 3
    && groups.slice(1).every(group => group.length === 3);
}

function isIndianGrouping(groups: readonly string[]): boolean {
  if (groups.length < 2 || groups[0].length < 1 || groups[0].length > 2) return false;
  if (groups.at(-1)?.length !== 3) return false;
  return groups.slice(1, -1).every(group => group.length === 2);
}

/**
 * Parse one unsigned numeric body into an exact, minimal decimal string.
 * The body must contain only supported digits and grouping/decimal separators.
 * The caller owns signs and accounting parentheses.
 */
function parseNumericBody(body: string): string | undefined {
  if (body.length === 0 || !isDigit(body[0]) || !isDigit(body[body.length - 1])) {
    return undefined;
  }

  const groups: string[] = [];
  const separators: string[] = [];
  let digits = '';
  let digitCount = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (isDigit(char)) {
      digits += normalizedDigit(char);
      digitCount += 1;
      if (digitCount > MAX_INTEGER_DIGITS + MAX_FRACTION_DIGITS) return undefined;
      continue;
    }

    if (!isTightSeparator(char) && !isHorizontalSpace(char)) return undefined;
    if (digits.length === 0) return undefined;
    groups.push(digits);
    separators.push(normalizedSeparator(char));
    digits = '';
    if (groups.length > MAX_INTEGER_DIGITS + MAX_FRACTION_DIGITS) return undefined;
  }

  if (digits.length === 0) return undefined;
  groups.push(digits);

  const dotIndexes: number[] = [];
  const commaIndexes: number[] = [];
  let hasHardGrouping = false;
  for (let index = 0; index < separators.length; index += 1) {
    const separator = separators[index];
    if (separator === '.') dotIndexes.push(index);
    else if (separator === ',') commaIndexes.push(index);
    else hasHardGrouping = true;
  }

  let decimalIndex: number | undefined;
  if (dotIndexes.length > 0 && commaIndexes.length > 0) {
    const lastDot = dotIndexes[dotIndexes.length - 1];
    const lastComma = commaIndexes[commaIndexes.length - 1];
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const decimalIndexes = decimalSeparator === '.' ? dotIndexes : commaIndexes;
    if (decimalIndexes.length !== 1) return undefined;
    decimalIndex = decimalIndexes[0];
  } else {
    const punctuationIndexes = dotIndexes.length > 0 ? dotIndexes : commaIndexes;
    if (punctuationIndexes.length === 1) {
      const index = punctuationIndexes[0];
      const left = groups[index];
      const right = groups[index + 1];
      const zeroInteger = /^0+$/.test(left);
      const looksLikeGrouping = !hasHardGrouping
        && !zeroInteger
        && left.length <= 3
        && right.length === 3;
      if (!looksLikeGrouping) decimalIndex = index;
    } else if (punctuationIndexes.length > 1 && hasHardGrouping) {
      // Mixing a hard grouping style with repeated comma/dot separators is
      // ambiguous and almost always malformed (for example 1'234.567.89).
      return undefined;
    }
  }

  if (decimalIndex !== undefined && decimalIndex !== separators.length - 1) {
    return undefined;
  }

  const integerGroups = decimalIndex === undefined
    ? groups
    : groups.slice(0, decimalIndex + 1);
  const groupingSeparators = separators.slice(0, Math.max(0, integerGroups.length - 1));
  const groupingStyles = new Set(groupingSeparators);
  if (groupingStyles.size > 1) return undefined;

  if (integerGroups.length > 1) {
    const groupingStyle = groupingSeparators[0];
    const validGrouping = groupingStyle === ',' || groupingStyle === '.'
      ? isWesternGrouping(integerGroups) || isIndianGrouping(integerGroups)
      : isWesternGrouping(integerGroups);
    if (!validGrouping) return undefined;
  }

  const integerRaw = integerGroups.join('');
  const fractionRaw = decimalIndex === undefined ? '' : groups[decimalIndex + 1];
  if (integerRaw.length > MAX_INTEGER_DIGITS || fractionRaw.length > MAX_FRACTION_DIGITS) {
    return undefined;
  }

  const integer = integerRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  return fraction.length > 0 ? `${integer}.${fraction}` : integer;
}

function trimBounds(value: string): [number, number] {
  let start = 0;
  let end = value.length;
  while (start < end && /\s/u.test(value[start])) start += 1;
  while (end > start && /\s/u.test(value[end - 1])) end -= 1;
  return [start, end];
}

/**
 * Convert one complete numeric expression to an exact canonical decimal.
 *
 * Supported signs are `+`, ASCII minus, Unicode minus, and accounting
 * parentheses. A leading plus is intentionally omitted from the canonical
 * positive value; negative zero is canonicalized to `0`.
 */
export function canonicalNumeric(raw: string): string | undefined {
  let [start, end] = trimBounds(raw);
  if (start === end) return undefined;

  let negative = false;
  const parenthesized = raw[start] === '(' && raw[end - 1] === ')';
  if (parenthesized) {
    negative = true;
    start += 1;
    end -= 1;
    while (start < end && isHorizontalSpace(raw[start])) start += 1;
    while (end > start && isHorizontalSpace(raw[end - 1])) end -= 1;
  } else if (raw[start] === '(' || raw[end - 1] === ')') {
    return undefined;
  }

  const sign = raw[start];
  if (sign === '+' || sign === '-' || sign === '\u2212') {
    if (parenthesized && sign === '+') return undefined;
    negative = negative || sign === '-' || sign === '\u2212';
    start += 1;
    while (start < end && isHorizontalSpace(raw[start])) start += 1;
  }

  if (start === end) return undefined;
  const canonical = parseNumericBody(raw.slice(start, end));
  if (canonical === undefined) return undefined;
  return negative && canonical !== '0' ? `-${canonical}` : canonical;
}

function isExactGroupingSpace(text: string, index: number): boolean {
  if (!isHorizontalSpace(text[index]) || !isDigit(text[index - 1])) return false;
  if (isHorizontalSpace(text[index + 1])) return false;
  return isDigit(text[index + 1])
    && isDigit(text[index + 2])
    && isDigit(text[index + 3])
    && !isDigit(text[index + 4]);
}

function numericBodyEnd(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (isDigit(char)) {
      index += 1;
      continue;
    }
    if (isHorizontalSpace(char)) {
      if (!isExactGroupingSpace(text, index)) break;
      index += 1;
      continue;
    }
    if (isTightSeparator(char)) {
      const separatorStart = index;
      while (isTightSeparator(text[index])) index += 1;
      if (!isDigit(text[index])) return separatorStart;
      continue;
    }
    break;
  }
  return index;
}

/**
 * Normalize every numeric run in text without changing its UTF-16 length.
 *
 * Valid runs are replaced by their canonical ASCII decimal at the original
 * start offset and right-padded with spaces. Horizontal Unicode spaces/tabs
 * outside numeric runs become ASCII spaces. Malformed or oversized runs are
 * replaced character-for-character with U+FFFD, preventing downstream regexes
 * from backtracking into a valid-looking suffix of an invalid value.
 */
export function normalizeQuantitativeNumbers(text: string): string {
  const output: string[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (!isDigit(char)) {
      output.push(isHorizontalSpace(char) ? ' ' : normalizedQuantitativeSymbol(char));
      index += 1;
      continue;
    }

    const end = numericBodyEnd(text, index);
    const body = text.slice(index, end);
    const canonical = parseNumericBody(body);
    if (canonical === undefined || canonical.length > body.length) {
      output.push(MASK.repeat(body.length));
    } else {
      output.push(canonical, ' '.repeat(body.length - canonical.length));
    }
    index = end;
  }

  return output.join('');
}

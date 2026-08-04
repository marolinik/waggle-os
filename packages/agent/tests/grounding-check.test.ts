import { describe, it, expect } from 'vitest';
import { extractClaimedSpecifics, checkGrounding } from '../src/grounding-check.js';

// The real LOCKED-frame memory the live agent recalled (abridged).
const MEMORY = `Marko Markovic is founder and CEO of Egzakta Group. Working on Waggle OS launch project.
LOCKED DECISIONS:
1. Pricing: Pro at $19/month, Teams at $49/seat/month
2. Public launch gated on beating Mem0's LoCoMo memory benchmark
TEAM:
- Ivan: owns LM TEK and GPU hardware, default rack is eight H200s
- Mihail: owns GAPA+BPMN prompt architecture`;

describe('extractClaimedSpecifics', () => {
  it('extracts money, percent, duration, and stat-noun counts', () => {
    const s = extractClaimedSpecifics('We have $19/month pricing, a 73% gap, 4 months runway, and 227 entities.');
    const kinds = s.map((x) => x.kind).sort();
    expect(kinds).toContain('money');
    expect(kinds).toContain('percent');
    expect(kinds).toContain('duration');
    expect(kinds).toContain('count');
  });

  it('does NOT flag benign advice quantities (non-stat nouns)', () => {
    const s = extractClaimedSpecifics('Ask Ivan 3 questions, pick 2 options, try 5 ways.');
    // "questions"/"options"/"ways" are not stat nouns → no count specifics
    expect(s.filter((x) => x.kind === 'count')).toHaveLength(0);
  });

  it('does not interpret an opening arithmetic parenthesis as negative money', () => {
    const money = extractClaimedSpecifics(
      'A lower burn extends runway to 5 months ($40,000.00 ÷ $8,000.00).',
    ).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.text)).toEqual(['$40,000.00', '$8,000.00']);
    expect(money.map(specific => specific.number)).toEqual(['40000', '8000']);
  });

  it('preserves balanced accounting and explicit negative money', () => {
    const money = extractClaimedSpecifics(
      'Accounting loss: ($40,000.00). Cash deficit: -$10,000.00.',
    ).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.text)).toEqual(['($40,000.00)', '-$10,000.00']);
    expect(money.map(specific => specific.number)).toEqual(['-40000', '-10000']);
  });

  it('treats a parenthesized divisor as arithmetic grouping, not accounting-negative money', () => {
    const result = checkGrounding(
      'Runway = $40,000 / ($10,000).',
      'Cash is $40,000. Monthly burn is $10,000.',
    );

    expect(result.specifics.map(specific => specific.number)).toEqual(['40000', '10000']);
    expect(result.ungrounded).toEqual([]);
    expect(result.score).toBe(1);
  });

  it('preserves accounting negativity when a currency label precedes the closing parenthesis', () => {
    const result = checkGrounding(
      'Revenue was ($10,000 USD).',
      'Revenue was $10,000.',
    );

    expect(result.specifics.map(specific => specific.number)).toEqual(['-10000']);
    expect(result.ungrounded.map(specific => specific.number)).toEqual(['-10000']);
  });

  it('treats a parenthesized money apposition as positive', () => {
    const result = checkGrounding(
      'Cash on hand ($40,000) is available.',
      'Cash is $40,000.',
    );

    expect(result.specifics.map(specific => specific.number)).toEqual(['40000']);
    expect(result.ungrounded).toEqual([]);
  });

  it.each([
    ['subtraction', 'Remaining = $40,000 - ($10,000).', ['40000', '10000']],
    ['multiplication', 'Twelve months is 12 × ($10,000).', ['10000']],
    ['burn apposition', 'Monthly burn ($10,000).', ['10000']],
    ['cost apposition', 'Cost ($5,000).', ['5000']],
  ])('treats %s grouping or apposition as positive', (_label, text, expected) => {
    const money = extractClaimedSpecifics(text).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.number)).toEqual(expected);
  });

  it('extracts currency-prefixed and Unicode negative signs', () => {
    const money = extractClaimedSpecifics(
      'First loss was $-10,000; second loss was −$20,000.',
    ).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.text)).toEqual(['$-10,000', '−$20,000']);
    expect(money.map(specific => specific.number)).toEqual(['-10000', '-20000']);
  });

  it('preserves explicit negative signs inside arithmetic groups and appositions', () => {
    const money = extractClaimedSpecifics(
      'Total = $40,000 + (-$10,000). Monthly burn (-$10,000).',
    ).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.number)).toEqual(['40000', '-10000', '-10000']);
  });

  it('recognizes an ASCII negative sign separated from the currency symbol', () => {
    const money = extractClaimedSpecifics('Revenue is - $10,000. Pricing: Pro - $19/month.')
      .filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.number)).toEqual(['-10000', '19']);
  });

  it('does not backtrack to a partial amount before an unsupported cadence', () => {
    const money = extractClaimedSpecifics('Teams is $49/seat/weekly.')
      .filter(specific => specific.kind === 'money');

    expect(money).toEqual([]);
  });

  it('does not partially parse magnitude suffixes', () => {
    const supported = extractClaimedSpecifics('Revenue is $19B.')
      .filter(specific => specific.kind === 'money');
    const unsupported = extractClaimedSpecifics('Revenue is $19Q.')
      .filter(specific => specific.kind === 'money');

    expect(supported.map(specific => specific.number)).toEqual(['19000000000']);
    expect(unsupported).toEqual([]);
  });

  it('normalizes non-breaking spaces inside money', () => {
    for (const text of [
      'Revenue is $\u00a010,000.',
      'Revenue is $\u200710,000.',
      'Revenue is $\u200910,000.',
      'Revenue is $\u200a10,000.',
      'Revenue is $\u202f10,000.',
      'Revenue is $\u205f10,000.',
    ]) {
      expect(extractClaimedSpecifics(text).filter(specific => specific.kind === 'money'))
        .toMatchObject([{ number: '10000', subject: 'revenue' }]);
    }
  });

  it('extracts currency labels before cadence without dropping the cadence', () => {
    const money = extractClaimedSpecifics(
      'Pricing is $19 USD per month. Price is $19 dollars per year. Pricing is $49 USD per seat per month. Price is $29 monthly. Pricing is $39 annually.',
    ).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.text)).toEqual([
      '$19 USD per month',
      '$19 dollars per year',
      '$49 USD per seat per month',
      '$29 monthly',
      '$39 annually',
    ]);
    expect(money.map(specific => specific.cadence)).toEqual([
      'month',
      'year',
      'seat/month',
      'month',
      'year',
    ]);
  });

  it('preserves source order across mixed-currency claims', () => {
    const money = extractClaimedSpecifics('Pricing is €19 and support costs $20.')
      .filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.number)).toEqual(['19', '20']);
    expect(money.map(specific => specific.currency)).toEqual(['eur', 'usd']);
  });

  it('coalesces overlapping foreign-currency claims and preserves signs', () => {
    const cad = extractClaimedSpecifics('Pricing is $19 CAD per month.')
      .filter(specific => specific.kind === 'money');
    const negatives = ['-€10,000', '€-10,000', 'EUR -10,000', '(€10,000)']
      .flatMap(text => extractClaimedSpecifics(`Revenue is ${text}.`))
      .filter(specific => specific.kind === 'money');

    expect(cad).toMatchObject([{ number: '19', currency: 'cad', cadence: 'month' }]);
    expect(negatives.map(specific => specific.number)).toEqual([
      '-10000', '-10000', '-10000', '-10000',
    ]);
  });

  it('preserves signs and currencies on regional-dollar prefixes', () => {
    const money = extractClaimedSpecifics(
      'Canadian losses were -CA$19 and (CA$20); Australian loss was AU$-21.',
    ).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.number)).toEqual(['-19', '-20', '-21']);
    expect(money.map(specific => specific.currency)).toEqual(['cad', 'cad', 'aud']);
  });

  it('extracts explicit currency syntax without a dollar sign and ignores ambiguous prose', () => {
    for (const reply of [
      'Revenue is 10000 dollars.',
      'Revenue is USD 10000.',
      'Revenue is 10000€.',
    ]) {
      const result = checkGrounding(reply, 'Revenue is unavailable.');
      expect(result.specifics.filter(specific => specific.kind === 'money'), reply).toHaveLength(1);
      expect(result.ungrounded.filter(specific => specific.kind === 'money'), reply).toHaveLength(1);
    }

    expect(extractClaimedSpecifics('We won 10 customers.').filter(specific => specific.kind === 'money'))
      .toEqual([]);
    expect(extractClaimedSpecifics('The package weighs 10 pounds.').filter(specific => specific.kind === 'money'))
      .toEqual([]);
    for (const prose of [
      'Try 3 options.',
      'Use PHP 8.3 for this project.',
      'Rub 10 records before continuing.',
      'A sterling 10 performance score.',
    ]) {
      expect(extractClaimedSpecifics(prose).filter(specific => specific.kind === 'money'), prose)
        .toEqual([]);
    }
    expect(extractClaimedSpecifics('Pricing is TRY 3.').filter(specific => specific.kind === 'money'))
      .toMatchObject([{ number: '3', currency: 'try', subject: 'price' }]);
    for (const prose of [
      'Revenue dashboard uses PHP 8.3.',
      'The pricing parser should try 3 alternatives.',
      'CAD 2024 pricing software is installed.',
      'Rub 10 revenue records before continuing.',
    ]) {
      expect(extractClaimedSpecifics(prose).filter(specific => specific.kind === 'money'), prose)
        .toEqual([]);
    }
  });

  it('extracts strongly-bound compact and magnitude finance values', () => {
    for (const [text, expected] of [
      ['Revenue is USD19.', { number: '19', currency: 'usd', subject: 'revenue' }],
      ['Revenue is 19EUR.', { number: '19', currency: 'eur', subject: 'revenue' }],
      ['ARR is 5M.', { number: '5000000', subject: 'annual recurring revenue' }],
      ['Valuation is 2 billion.', { number: '2000000000', subject: 'valuation' }],
    ] as const) {
      expect(extractClaimedSpecifics(text).filter(specific => specific.kind === 'money'), text)
        .toMatchObject([expected]);
    }
    expect(extractClaimedSpecifics('Margin is 5 per cent; uplift is 7 pct.')
      .filter(specific => specific.kind === 'percent'))
      .toMatchObject([{ number: '5', unit: 'percent' }, { number: '7', unit: 'percent' }]);
  });

  it('extracts explicit suffix currencies instead of passing them through unchecked', () => {
    for (const [text, expected] of [
      ['Revenue is 10000 EUR.', { number: '10000', currency: 'eur', subject: 'revenue' }],
      ['Revenue is 10,000 EUR.', { number: '10000', currency: 'eur', subject: 'revenue' }],
      ['Revenue is 10,000€.', { number: '10000', currency: 'eur', subject: 'revenue' }],
      ['Pricing is 19 AUD/month.', { number: '19', currency: 'aud', subject: 'price', cadence: 'month' }],
    ] as const) {
      const money = extractClaimedSpecifics(text).filter(specific => specific.kind === 'money');
      expect(money, text).toMatchObject([expected]);
      expect(checkGrounding(text, 'No matching finance fact was supplied.').ungrounded, text)
        .toHaveLength(1);
    }
  });

  it('does not interpret alphabetic currency codes in code declarations as money', () => {
    for (const code of [
      'const revenue = PHP 8.3;',
      'const revenue = CAD 2024;',
      'let pricing = TRY 3;',
      'var revenue = RUB 10;',
    ]) {
      expect(extractClaimedSpecifics(code).filter(specific => specific.kind === 'money'), code)
        .toEqual([]);
    }
  });

  it('extracts digit-bearing stat nouns and magnitude counts as counts', () => {
    expect(extractClaimedSpecifics('We operate 8 H200s.'))
      .toMatchObject([{ kind: 'count', number: '8', unit: 'h200' }]);

    for (const text of ['We have 5 million users.', 'We have 5M users.']) {
      const specifics = extractClaimedSpecifics(text);
      expect(specifics.filter(specific => specific.kind === 'count'), text)
        .toMatchObject([{ number: '5000000', unit: 'user' }]);
      expect(specifics.filter(specific => specific.kind === 'money'), text).toEqual([]);
      expect(checkGrounding(text, text).ungrounded, text).toEqual([]);
    }
  });

  it('normalizes full-width decimal characters without bypassing extraction', () => {
    const claim = 'Revenue is $１０，０００.';
    expect(extractClaimedSpecifics(claim).filter(specific => specific.kind === 'money'))
      .toMatchObject([{ number: '10000', subject: 'revenue', currency: 'usd' }]);
    expect(checkGrounding(claim, 'Revenue is $10,000.').ungrounded).toEqual([]);
    expect(checkGrounding(claim, 'Revenue was not supplied.').ungrounded).toHaveLength(1);
  });

  it('normalizes Unicode thousands separators inside money values', () => {
    const reply = 'Revenue is $10\u202f000.';

    expect(extractClaimedSpecifics(reply).filter(specific => specific.kind === 'money'))
      .toMatchObject([{ number: '10000', subject: 'revenue' }]);
    expect(checkGrounding(reply, 'Revenue is $10,000.').ungrounded).toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', reply).ungrounded).toEqual([]);
  });

  it('normalizes explicit European decimal money', () => {
    const claim = extractClaimedSpecifics('Pricing is €19,99.')
      .find(specific => specific.kind === 'money');

    expect(claim).toMatchObject({ number: '19.99', currency: 'eur', subject: 'price' });
    expect(checkGrounding('Pricing is €19,99.', 'Pricing is EUR 19.99.').ungrounded)
      .toEqual([]);
    const grouped = extractClaimedSpecifics('Pricing is €1.234,56.')
      .filter(specific => specific.kind === 'money');
    expect(grouped).toMatchObject([{ number: '1234.56', currency: 'eur', subject: 'price' }]);
    expect(checkGrounding('Pricing is €1.234,56.', 'Pricing is EUR 1234.56.').ungrounded).toEqual([]);
    expect(checkGrounding('Pricing is EUR 1234.56.', 'Pricing is €1.234,56.').ungrounded).toEqual([]);
  });

  it('normalizes apostrophe grouping and regional currency symbols', () => {
    expect(checkGrounding('Revenue is CHF 1\'234.56.', 'Revenue is CHF 1234.56.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is C$1,000.', 'Revenue is CAD 1000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is R$1,000.', 'Revenue is BRL 1000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is S$1,000.', 'Revenue is SGD 1000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is NT$1,000.', 'Revenue is TWD 1000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is CN¥19.', 'Revenue is CNY 19.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is RMB ¥19.', 'Revenue is CNY 19.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is CN¥19.', 'Revenue is JPY 19.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is INR 1,23,456.78.', 'Revenue is INR 123456.78.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is C$1,000.', 'Revenue is USD 1000.').ungrounded)
      .toHaveLength(1);
  });

  it('preserves sign, grouping, and unit semantics across other quantitative kinds', () => {
    const specifics = extractClaimedSpecifics(
      'Net margin is -5%; uplift is 5 pp; history spans 1,000 months; membership is -5 users.',
    );

    expect(specifics).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'percent', number: '-5', unit: 'percent' }),
      expect.objectContaining({ kind: 'percent', number: '5', unit: 'percentage-point' }),
      expect.objectContaining({ kind: 'duration', number: '1000', unit: 'month' }),
      expect.objectContaining({ kind: 'count', number: '-5', unit: 'user' }),
    ]));
  });

  it('preserves plus and accounting signs without treating Markdown bullets as negatives', () => {
    expect(extractClaimedSpecifics('Revenue is +$10,000.').filter(specific => specific.kind === 'money'))
      .toMatchObject([{ number: '10000', subject: 'revenue' }]);
    expect(extractClaimedSpecifics('Revenue is +USD 10,000.').filter(specific => specific.kind === 'money'))
      .toMatchObject([{ number: '10000', subject: 'revenue', currency: 'usd' }]);
    expect(extractClaimedSpecifics('Revenue is USD -$19.').filter(specific => specific.kind === 'money'))
      .toMatchObject([{ number: '-19', subject: 'revenue', currency: 'usd' }]);
    expect(extractClaimedSpecifics('Revenue is CHF (1,234.56).').filter(specific => specific.kind === 'money'))
      .toMatchObject([{ number: '-1234.56', subject: 'revenue', currency: 'chf' }]);
    expect(extractClaimedSpecifics('Net margin is (5%).').filter(specific => specific.kind === 'percent'))
      .toMatchObject([{ number: '-5', subject: 'net margin' }]);
    for (const text of ['- 5 users are active.', '- 4 months runway.', '- 73% gross margin.', '- 5 pp uplift.']) {
      expect(checkGrounding(text, text).ungrounded, text).toEqual([]);
    }
  });

  it('keeps sentence commas outside money values and finance-subject binding', () => {
    const money = extractClaimedSpecifics(
      'Revenue is $49, burn is unknown. Revenue later reached $49,000, burn unchanged.',
    ).filter(specific => specific.kind === 'money');

    expect(money.map(specific => specific.text)).toEqual(['$49', '$49,000']);
    expect(money.map(specific => specific.subject)).toEqual(['revenue', 'revenue']);
    expect(checkGrounding('Revenue is $49.', 'Revenue is $49, burn is unknown.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $49, burn is unknown.', 'Revenue is unknown; burn is $49.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $49,000.', 'Revenue is $49,000, burn is unknown.').ungrounded)
      .toEqual([]);
  });
});

describe('checkGrounding — the live confabulation cases', () => {
  it('flags "4 months runway" as ungrounded (not in memory)', () => {
    const r = checkGrounding('You are pre-revenue with 4 months runway.', MEMORY);
    expect(r.ungrounded.some((s) => s.text.includes('4 month'))).toBe(true);
  });

  it('flags "227 entities" as ungrounded (real count is not in memory)', () => {
    const r = checkGrounding('I have 227 entities tracked.', MEMORY);
    expect(r.ungrounded.some((s) => s.number === '227')).toBe(true);
  });

  it('grounds "$19/month" (it IS in the LOCKED decisions)', () => {
    const r = checkGrounding('Your pricing is Pro at $19/month.', MEMORY);
    expect(r.grounded.some((s) => s.number === '19')).toBe(true);
    expect(r.ungrounded.some((s) => s.number === '19')).toBe(false);
    expect(checkGrounding('Your pricing is Pro at $19/month.', 'Pricing: Pro — $19/month.').ungrounded)
      .toEqual([]);
    for (const source of [
      'Pricing — Pro at $19/month.',
      'Pricing - Pro at $19/month.',
      'Pricing: Pro - $19/month.',
      'Pricing: Pro -$19/month.',
      'Pricing: Pro-$19/month.',
      'Pricing: Pro—$19/month.',
      'Pricing: Pro–$19/month.',
    ]) {
      expect(checkGrounding('Your pricing is Pro at $19/month.', source).ungrounded, source).toEqual([]);
    }
    expect(checkGrounding('Revenue is $10,000.', 'Revenue came in at $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue reached $10,000.').ungrounded)
      .toEqual([]);
  });

  it('grounds a percentage that appears in sources, flags one that does not', () => {
    expect(checkGrounding('a 73% lift', 'we measured a 73% lift').ungrounded).toHaveLength(0);
    expect(checkGrounding('a 99% lift', MEMORY).ungrounded.some((s) => s.number === '99')).toBe(true);
  });

  it('grounds formatted money from equivalent user-supplied numbers', () => {
    const sources = 'Cash is 40000 dollars, monthly burn is 10000 dollars, and revenue is zero.';
    const reply = 'Cash is $40,000.00, monthly burn is $10,000.00, and revenue is $0.00.';

    const result = checkGrounding(reply, sources);

    expect(result.ungrounded).toEqual([]);
    expect(result.grounded.map(specific => specific.number)).toEqual(['40000', '10000', '0']);
    expect(checkGrounding('Revenue is $0.00.', 'No revenue figure was supplied.').ungrounded)
      .toHaveLength(1);
    const unrelatedZero = 'There were zero failed tests; no revenue figure was supplied.';
    expect(checkGrounding('Revenue is $0.00.', unrelatedZero).ungrounded).toHaveLength(1);
    expect(checkGrounding('Conversion was 0%.', unrelatedZero).ungrounded).toHaveLength(1);
    expect(checkGrounding('Revenue is $0.00.', 'Revenue is not zero.').ungrounded).toHaveLength(1);
    expect(checkGrounding('Revenue is $0.00.', 'Without zero revenue, the model cannot proceed.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $0.00.', 'Cash is zero; no revenue figure was supplied.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $0.00.', 'Cash is zero and revenue was not supplied.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'Burn is 10000 dollars, and revenue was not supplied.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Cash is $0.00.', 'Cash is zero.').ungrounded).toEqual([]);
    expect(checkGrounding('$19 pricing.', 'Pricing is 19.').ungrounded).toEqual([]);
    const postfixedLabels = checkGrounding(
      'Cash is $40,000; $10,000 is monthly burn; revenue is $0.',
      'Cash is 40000 dollars, monthly burn is 10000 dollars, and revenue is zero.',
    );
    expect(postfixedLabels.ungrounded).toEqual([]);
    const repeatedFormula = checkGrounding(
      'Cash: $40,000.00\nMonthly burn: $10,000.00\nRevenue: $0.00\n\nRunway = $40,000.00 ÷ $10,000.00 = 4 months.',
      sources,
    );
    expect(repeatedFormula.ungrounded.filter(specific => specific.kind === 'money')).toEqual([]);
    expect(checkGrounding('Monthly burn is $10,000.', '10000 dollars in monthly burn.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue is pending; 10000 dollars in monthly burn.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue TBD. 10000 dollars in monthly burn.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is -$10,000.', 'Revenue is $10,000.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is −$10,000.', 'Revenue is −10000 dollars.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is −$10,000.', 'Revenue is −10k.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', 'Not 10000 dollars in revenue.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'There was no revenue of $10,000.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'No revenue reached $10,000.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'This is not an estimate: revenue is $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', 'Do not omit this — revenue is $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', 'No revenue: $10,000.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10.', 'Revenue is 10%.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue is 10000 customers.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Sales are $10,000.', 'Sales are 10,000 units.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Sales are $10,000.', 'Sales are 10,000 orders.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue is 10000 euros.').ungrounded)
      .toHaveLength(1);
    for (const source of [
      'Revenue is 10000 shares.',
      'Revenue is 10000 CAD.',
      'Revenue is $10,000 CAD.',
      'EUR 10000 is revenue.',
      'GBP 10000 revenue.',
      '€10000 revenue.',
      '10000 AUD revenue.',
      '10000 CHF revenue.',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toHaveLength(1);
    }
    for (const source of [
      'widgets 10000 revenue.',
      'shares 10000 is revenue.',
      'kg 10000 revenue.',
      'Revenue is 10000 in units.',
      'Revenue is 10000 in CAD.',
      'Revenue is 10000 total units.',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toHaveLength(1);
    }
    expect(checkGrounding('Revenue is $10,000.', 'Approximately 10000 revenue.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $19m.', 'Revenue is $19.').ungrounded).toHaveLength(1);
    expect(checkGrounding('Revenue is $19k.', 'Revenue is $19.').ungrounded).toHaveLength(1);
    expect(checkGrounding('Revenue is $19.', 'Revenue is $19m.').ungrounded).toHaveLength(1);
    expect(checkGrounding('Revenue is $19m.', 'Revenue is $19 million.').ungrounded).toEqual([]);
    expect(checkGrounding('Revenue is $19B.', 'Revenue is $19.').ungrounded).toHaveLength(1);
    expect(checkGrounding('Revenue is $9007199254740992.', 'Revenue is $9007199254740993.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $9007199254740993.', 'Revenue is $9007199254740993.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Runway input: $10,000.', 'Cash deficit: -10000 dollars.').ungrounded)
      .toHaveLength(1);
    const negativeFormulaSource = checkGrounding(
      'Runway = $10,000 / $5,000.',
      'Cash is -10000 dollars; burn is 5000 dollars.',
    );
    expect(negativeFormulaSource.ungrounded.map(specific => specific.number)).toContain('10000');
    expect(negativeFormulaSource.grounded.map(specific => specific.number)).toContain('5000');
    expect(checkGrounding('Revenue is -$10,000.', 'Revenue is - 10000 dollars.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue is - 10000 dollars.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue: - 10000 dollars.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is -$10,000.', 'Revenue: - 10000 dollars.').ungrounded)
      .toEqual([]);
  });

  it('binds a claim to the nearest finance subject in a multi-subject sentence', () => {
    const reply = 'Revenue is unknown while burn is $10,000.';
    const mismatched = 'Cash is $10,000; revenue is unknown; burn is unknown.';

    expect(checkGrounding(reply, mismatched).ungrounded.map(specific => specific.number))
      .toEqual(['10000']);
    expect(checkGrounding(reply, 'Revenue is unknown while burn is $10,000.').ungrounded)
      .toEqual([]);
  });

  it('prefers an explicit postfixed finance subject over an earlier subject', () => {
    const reply = 'Revenue is unknown but $10,000 is monthly burn.';

    expect(checkGrounding(reply, 'Revenue is $10,000; burn is unknown.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding(reply, 'Revenue is unknown; burn is $10,000.').ungrounded)
      .toEqual([]);
  });

  it('keeps a clear preceding subject when a weak postfixed phrase names another field', () => {
    const reply = 'Revenue is $10,000 in cash.';

    expect(checkGrounding(reply, 'Revenue is unknown; cash is $10,000.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding(reply, 'Revenue is $10,000; cash is unknown.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000.', 'Revenue is $10,000 in cash.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Burn is $10,000.', '$10,000 is monthly burn.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Cash is $10,000.', 'Revenue is $10,000 in cash.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Burn is $10,000.', 'Revenue is $10,000 for burn.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'We budgeted $10,000 for revenue.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', 'Allocated: $10,000 for revenue.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue is $10,000.', '- $10,000 for revenue.').ungrounded)
      .toHaveLength(1);
    for (const source of [
      'Approximately 10000 dollars in revenue.',
      'The company has 10000 dollars in revenue.',
      'We recorded 10000 dollars of revenue.',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toEqual([]);
    }
  });

  it('keeps common finance subjects isolated and canonical', () => {
    expect(checkGrounding('Sales are $10,000.', 'Sales are $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Profit is $10,000.', 'Revenue is $10,000; profit unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Profit is $10,000.', 'Profit is $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Monthly costs are $10,000.', 'Revenue is $10,000; costs unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Prices are $10,000.', 'Revenue is $10,000; prices unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Monthly costs are $10,000.', 'Monthly costs are $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Prices are $10,000.', 'Prices are $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('ARR is $10,000.', 'Burn is $10,000; ARR unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('ARR is $10,000.', 'ARR is $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue:\r\n$10,000.', 'Burn is $10,000.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Revenue:\r\n$10,000.', 'Revenue is $10,000.').ungrounded)
      .toEqual([]);
    for (const subject of ['EBITDA', 'Payroll', 'Debt']) {
      expect(checkGrounding(`${subject} is $10,000.`, `Burn is $10,000; ${subject} unavailable.`).ungrounded)
        .toHaveLength(1);
      expect(checkGrounding(`${subject} is $10,000.`, `${subject} is $10,000.`).ungrounded)
        .toEqual([]);
    }
    for (const subject of [
      'Valuation', 'Salary', 'Capex', 'Opex', 'Assets', 'Liabilities', 'COGS', 'Loss',
    ]) {
      expect(checkGrounding(`${subject} is $10,000.`, `Revenue is $10,000; ${subject} unavailable.`).ungrounded)
        .toHaveLength(1);
      expect(checkGrounding(`${subject} is $10,000.`, `${subject} is $10,000.`).ungrounded)
        .toEqual([]);
    }
    for (const reply of [
      'Revenue, not cash, is $10,000.',
      'Revenue (not cash) is $10,000.',
      'Revenue, excluding cash, is $10,000.',
      'Revenue rather than cash is $10,000.',
      'Revenue, excluding the cash, is $10,000.',
      'Revenue rather than current cash is $10,000.',
      'Revenue, not available cash, is $10,000.',
    ]) {
      expect(checkGrounding(reply, 'Burn is $10,000.').ungrounded).toHaveLength(1);
      expect(checkGrounding(reply, 'Revenue is $10,000; cash unavailable.').ungrounded).toEqual([]);
      expect(checkGrounding(reply, 'Cash is $10,000; revenue unavailable.').ungrounded).toHaveLength(1);
    }
  });

  it('keeps qualified generic finance subjects distinct', () => {
    const claim = extractClaimedSpecifics('Gross margin is $10,000.')
      .find(specific => specific.kind === 'money');

    expect(claim?.subject).toBe('gross margin');
    expect(checkGrounding('Gross margin is $10,000.', 'Gross margin is $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Gross margin is $10,000.', 'Net margin is $10,000.').ungrounded)
      .toHaveLength(1);
    for (const [claimSubject, otherSubject] of [
      ['Gross profit', 'Net profit'],
      ['Gross revenue', 'Net revenue'],
    ]) {
      expect(checkGrounding(
        `${claimSubject} is $10,000.`,
        `${otherSubject} is $10,000; ${claimSubject} unavailable.`,
      ).ungrounded, `${claimSubject} vs ${otherSubject}`).toHaveLength(1);
    }
    expect(checkGrounding('Bookings: $10,000.', 'Revenue is $10,000; bookings unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Bookings: $10,000.', 'Bookings: $10,000.').ungrounded).toEqual([]);
    for (const [claim, wrongSource] of [
      ['Revenue including cash is $10,000.', 'Cash is $10,000; revenue unavailable.'],
      ['Revenue excluding all cash and debt is $10,000.', 'Debt is $10,000; revenue unavailable.'],
      ['Cost of sales is $10,000.', 'Sales are $10,000; cost of sales unavailable.'],
      ['Cash balance is $10,000.', 'Balance is $10,000; cash balance unavailable.'],
      ['Adjusted EBITDA is $10,000.', 'Reported EBITDA is $10,000; adjusted unavailable.'],
      ['Current assets are $10,000.', 'Fixed assets are $10,000; current unavailable.'],
      ['Annual recurring revenue is $10,000.', 'Monthly recurring revenue is $10,000.'],
      ['Operating expenses are $10,000.', 'Capital expenses are $10,000.'],
    ]) {
      expect(checkGrounding(claim, wrongSource).ungrounded, claim).toHaveLength(1);
      expect(checkGrounding(claim, claim).ungrounded, claim).toEqual([]);
    }
    expect(checkGrounding('GMV = $10,000.', 'Revenue = $10,000; GMV unavailable.').ungrounded)
      .toHaveLength(1);
    for (const [claim, source] of [
      ['Annual revenue is $10,000.', 'Monthly revenue is $10,000.'],
      ['Annual costs are $10,000.', 'Monthly costs are $10,000.'],
      ['Annual payroll is $10,000.', 'Monthly payroll is $10,000.'],
      ['Recurring revenue is $10,000.', 'Revenue is $10,000.'],
      ['Operating margin is $10,000.', 'Gross margin is $10,000.'],
      ['Contribution margin is $10,000.', 'Margin is $10,000.'],
    ]) {
      expect(checkGrounding(claim, source).ungrounded, `${claim} <- ${source}`).toHaveLength(1);
      expect(checkGrounding(claim, claim).ungrounded, claim).toEqual([]);
    }
    expect(checkGrounding('Revenue is $10,000.', 'Actual revenue is $10,000.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Actual revenue is $10,000.', 'Revenue is $10,000.').ungrounded)
      .toHaveLength(1);
  });

  it('binds finance percentages to their qualified subject', () => {
    expect(checkGrounding('Gross margin is 73%.', 'Gross margin is 73%.').ungrounded)
      .toEqual([]);
    expect(checkGrounding(
      'Gross margin is 73%.',
      'Net margin is 73%; gross margin unavailable.',
    ).ungrounded).toHaveLength(1);
    expect(checkGrounding('Gross margin 73%.', 'Net margin 73%; gross unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Gross margin rose 73%.', 'Gross margin rose 73%.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Net margin is -5%.', 'Net margin is 5%.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Net margin is 5 pp.', 'Net margin is 5%.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Net margin is 1,000%.', 'Net margin is 0%.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Net margin is (5%).', 'Net margin is 5%.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Operating margin is 73%.', 'Gross margin is 73%.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding(
      'Revenue was $10k and margin was $10k.',
      'Revenue was $10k and margin unavailable.',
    ).ungrounded).toHaveLength(1);
  });

  it('rejects negated, unavailable, inequality, and malformed source values', () => {
    for (const source of [
      'Revenue has not reached $10k.',
      'Revenue was unavailable at $10k.',
      'Revenue was below $10k.',
      'Revenue is $1  234.',
      'Revenue is $12-34.',
      'Revenue is $12 -34.',
      'Revenue is $12 - 34.',
    ]) {
      expect(checkGrounding('Revenue is $1234.', source).ungrounded, source).toHaveLength(1);
    }
    expect(checkGrounding('Margin is 1234%.', 'Margin is 12-34%.').ungrounded).toHaveLength(1);
    expect(checkGrounding('Runway is 1234 months.', 'Runway is 12-34 months.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('There are 1234 users.', 'There are 12-34 users.').ungrounded)
      .toHaveLength(1);
    for (const malformed of [
      'Revenue is $1_000.',
      'Revenue is USD 1_000.',
      'Revenue is EUR 1_000.',
      'Revenue is C$1_000.',
      'Revenue is $1,000foo.',
    ]) {
      expect(extractClaimedSpecifics(malformed).filter(specific => specific.kind === 'money'), malformed)
        .toEqual([]);
    }
    expect(checkGrounding('Revenue stands at $10k.', 'Revenue stands at $10k.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Gross margin stands at 73%.', 'Gross margin stands at 73%.').ungrounded)
      .toEqual([]);
  });

  it('rejects non-assertive and malformed non-money source occurrences', () => {
    for (const [reply, source] of [
      ['There are 227 users.', 'There are not 227 users.'],
      ['Runway is 4 months.', 'We do not have 4 months of runway.'],
      ['Runway is 4 months.', 'Runway is under 4 months.'],
      ['A 73% lift occurred.', 'It was not a 73% lift.'],
      ['There are 0 users.', 'There are 1_000 users.'],
      ['Runway is 0 months.', 'Runway is 1_000 months.'],
      ['Gross margin is 5%.', 'Gross margin is 5%foo.'],
      ['Gross margin is 5%.', 'Gross margin is 5%%.'],
    ]) {
      expect(checkGrounding(reply, source).ungrounded, `${reply} <- ${source}`).toHaveLength(1);
    }
  });

  it('requires lexical count and duration unit boundaries', () => {
    for (const [reply, source] of [
      ['There are 4 users.', 'There are 4 usernames.'],
      ['There are 4 users.', 'There are abuser 4 records.'],
      ['There are 4 agents.', 'There are 4 agentic workflows.'],
      ['There are 4 agents.', 'Reagent 4 was selected.'],
      ['There are 4 frames.', 'iframe 4 was rendered.'],
      ['Runway is 4 days.', 'The daydream 4 prototype shipped.'],
    ]) {
      expect(checkGrounding(reply, source).ungrounded, `${reply} <- ${source}`).toHaveLength(1);
    }
  });

  it('keeps finance ownership, time, epistemic, plan, delta, and compound identity isolated', () => {
    for (const [reply, source] of [
      ['Our revenue is $10,000.', 'Their revenue is $10,000.'],
      ['Revenue is $10,000.', 'Competitor revenue is $10,000.'],
      ['Projected revenue is $10,000.', 'Actual revenue is $10,000.'],
      ['Target revenue is $10,000.', 'Revenue is $10,000.'],
      ['Revenue is $10,000.', 'Last year revenue is $10,000.'],
      ['Pricing: Pro — $49/month.', 'Pricing: Teams — $49/month; Pro unavailable.'],
      ['Pro pricing is $49/month.', 'Pro pricing is $19/month. Teams pricing is $49/month.'],
      ['Revenue declined by $10,000.', 'Revenue is $10,000.'],
      ['Cash and revenue are $10,000.', 'Revenue is $10,000; cash unavailable.'],
    ]) {
      expect(checkGrounding(reply, source).ungrounded, `${reply} <- ${source}`).toHaveLength(1);
    }
  });

  it('accepts asserted finance predicates and isolates comma-separated facts', () => {
    for (const source of [
      'Revenue totaled $10,000.',
      'Revenue recorded $10,000.',
      'Revenue is approximately $10,000.',
      'Revenue is about $10,000.',
      'Revenue is estimated at $10,000.',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toEqual([]);
    }
    expect(checkGrounding('Cash is $10,000.', 'Revenue is unavailable, cash is $10,000.').ungrounded)
      .toEqual([]);
  });

  it('rejects interrogative and hypothetical source mentions', () => {
    for (const source of [
      'Is revenue $10,000?',
      'If revenue is $10,000, we can hire.',
      'Whether revenue is $10,000 remains unknown.',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toHaveLength(1);
    }
  });

  it('rejects adjacent non-money units in grounding sources', () => {
    for (const source of [
      'Sales are 10000orders.',
      'Sales are $10000orders.',
      'Sales are 10,000-unit.',
      'Sales are 10,000/orders.',
      'Sales are 10,000 (units).',
      'Sales are 10,000 [units].',
      'Sales are 10,000: units.',
    ]) {
      expect(checkGrounding('Sales are $10,000.', source).ungrounded, source).toHaveLength(1);
    }
    for (const source of [
      '10000 revenue widgets.',
      '10000 revenue in widgets.',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toHaveLength(1);
    }
  });

  it('does not bind a value to a finance subject across a newline', () => {
    expect(checkGrounding('Burn is $10,000.', 'Revenue is $10,000\nburn is unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Burn is $10,000.', 'Burn\n$10,000\nRevenue unavailable.').ungrounded)
      .toEqual([]);
    for (const newline of ['\n', '\r\n']) {
      const reply = `Revenue is unknown${newline}$10,000 in cash.`;
      const source = `Revenue is unknown${newline}10000 dollars in cash.`;

      expect(checkGrounding(reply, 'Revenue is $10,000; cash unavailable.').ungrounded)
        .toHaveLength(1);
      expect(checkGrounding(reply, 'Revenue unavailable; cash is $10,000.').ungrounded)
        .toEqual([]);
      expect(checkGrounding('Cash is $10,000.', source).ungrounded).toEqual([]);
    }
    expect(checkGrounding(
      'Revenue is $5,000 but $10,000 in cash.',
      'Revenue is $5,000 but $10,000 in cash.',
    ).ungrounded).toEqual([]);
    expect(checkGrounding('Cash is $10,000.', 'Revenue unavailable but 10000 dollars in cash.').ungrounded)
      .toEqual([]);
  });

  it('requires a claimed pricing cadence to match the source cadence', () => {
    expect(checkGrounding('Pricing is $19/year.', 'Pricing is $19/month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19/year.', 'Pricing is $19/year.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19.', 'Pricing is $19/month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Teams is $49/seat/year.', 'Teams is $49/seat/month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Teams is $49/seat/month.', 'Teams is $49/seat/month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Teams is $49/seat/monthly.', 'Teams is $49/seat/year.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Teams is $49/seat/monthly.', 'Teams is $49/seat/month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19 per year.', 'Pricing is $19/month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19/month.', 'Pricing is $19 per month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19 USD per year.', 'Pricing is $19/month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19 annually.', 'Pricing is $19/month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19 monthly.', 'Pricing is $19/month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19/month.', 'Pricing is 19 dollars per month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19/month.', 'Pricing:\n- 19 dollars per month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19/month.', 'Pricing: - 19 dollars per month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is -$19/month.', 'Pricing: - 19 dollars per month.').ungrounded)
      .toEqual([]);
    for (const claim of [
      'Pricing is $19 weekly.',
      'Pricing is $19 quarterly.',
      'Pricing is $19 annual.',
      'Pricing is $19 a year.',
      'Pricing is $19 each year.',
      'Pricing is $19 every year.',
      'Pricing is $19 per annum.',
    ]) {
      expect(checkGrounding(claim, 'Pricing is $19/month.').ungrounded, claim).toHaveLength(1);
    }
    for (const claim of [
      'Pricing is $19 billed per year.',
      'Pricing is $19 charged per year.',
      'Pricing is $19 billed every year.',
      'Pricing is $19 payable annually.',
    ]) {
      expect(checkGrounding(claim, 'Pricing is $19/month.').ungrounded, claim).toHaveLength(1);
      expect(checkGrounding(claim, 'Pricing is $19/year.').ungrounded, claim).toEqual([]);
    }
    expect(checkGrounding('Pricing is $19 every month.', 'Pricing is $19/month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19 every month.', 'Pricing is $19/year.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19 every year.', 'Pricing is $19/year.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19 per annum.', 'Pricing is $19/year.').ungrounded)
      .toEqual([]);
    for (const claim of [
      'Pricing is $19 daily.',
      'Pricing is $19 biweekly.',
      'Pricing is $19 hourly.',
      'Pricing is $19 nightly.',
      'Pricing is $19 semimonthly.',
      'Pricing is $19 semi-monthly.',
      'Pricing is $19 bi-weekly.',
      'Pricing is $19 every two weeks.',
      'Pricing is $19 every other week.',
      'Pricing is $19 twice monthly.',
      'Pricing is $19 twice a month.',
      'Pricing is $19 p.a.',
      'Pricing is $19 qtrly.',
      'Pricing is $19 each two weeks.',
      'Pricing is $19 every fortnight.',
      'Pricing is $19 once per month.',
      'Pricing is $19 every day.',
      'Pricing is $19 pa.',
      'Pricing is $19 p.m.',
      'Pricing is $19 pcm.',
    ]) {
      expect(extractClaimedSpecifics(claim).filter(specific => specific.kind === 'money'), claim)
        .toEqual([]);
    }
    for (const claim of ['Pricing is $19 CAD.', 'Pricing is CA$19.', 'Pricing is €19.']) {
      expect(checkGrounding(claim, 'Pricing is $19 USD.').ungrounded, claim).toHaveLength(1);
    }
    expect(checkGrounding('Pricing is $19 CAD.', 'Pricing is $19 CAD.').ungrounded).toEqual([]);
    expect(checkGrounding('Revenue is CA$10,000.', 'Revenue is 10000 in CAD.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is CA$10,000.', 'Revenue is 10000 in AUD.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is CA$19/month.', 'Pricing is 19 in CAD per month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is €19.', 'Pricing is EUR 19.').ungrounded).toEqual([]);
    expect(checkGrounding('Pricing is $19 CAD.', 'Pricing is 19.').ungrounded).toHaveLength(1);
    for (const [claim, source] of [
      ['Pricing is €19.', 'Pricing is €19.'],
      ['Pricing is $19 CAD per month.', 'Pricing is $19 CAD per month.'],
      ['Pricing is 19 AUD/month.', 'Pricing is 19 AUD/month.'],
      ['Pricing is €19/month.', 'Pricing is 19 EUR per month.'],
      ['Pricing is CAD $19/month.', 'Pricing is CAD $19/month.'],
    ]) {
      expect(checkGrounding(claim, source).ungrounded, `${claim} <- ${source}`).toEqual([]);
    }
    expect(checkGrounding('Pricing is $19 CAD/month.', 'Pricing is $19 CAD/year.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19/years.', 'Pricing is $19/years.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Monthly pricing is $19.', 'Annual pricing is $19.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Monthly pricing is $19.', 'Monthly pricing is $19.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Price per month is $19.', 'Price per year is $19.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding(
      'Pricing is $19/month.',
      'Monthly meeting notes: pricing is $19.',
    ).ungrounded).toHaveLength(1);
    expect(checkGrounding('Pricing is $19 billed annually.', 'Pricing is $19/month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19 (monthly).', 'Pricing is $19/year.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Pricing is $19 per calendar month.', 'Pricing is $19/month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19 every calendar month.', 'Pricing is $19/month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $19 every calendar month.', 'Pricing is $19/year.').ungrounded)
      .toHaveLength(1);
    for (const claim of [
      'Pricing is $19, billed monthly.',
      'Pricing is $19 (billed monthly).',
      'Pricing is $19 charged monthly.',
      'Pricing is monthly at $19.',
    ]) {
      expect(checkGrounding(claim, 'Pricing is $19/year.').ungrounded, claim).toHaveLength(1);
      expect(checkGrounding(claim, 'Pricing is $19/month.').ungrounded, claim).toEqual([]);
    }
    expect(checkGrounding('Pricing is $19 (monthly).', 'Pricing is $19 (monthly).').ungrounded)
      .toEqual([]);
    for (const claim of ['Revenue is -€10,000.', 'Revenue is €-10,000.', 'Revenue is EUR -10,000.']) {
      expect(checkGrounding(claim, 'Revenue is 10000 EUR.').ungrounded, claim).toHaveLength(1);
      expect(checkGrounding(claim, 'Revenue is -10000 EUR.').ungrounded, claim).toEqual([]);
    }
    expect(checkGrounding('Pricing is $19 per year.', 'Pricing is 19 per year.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Revenue is $10,000/month.', '10000 dollars per month in revenue.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $49/seat/month.', 'Pricing is 49 dollars per seat per month.').ungrounded)
      .toEqual([]);
    expect(checkGrounding('Pricing is $49/seat/year.', 'Pricing is 49 dollars per seat per month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Teams is $49 per seat per year.', 'Teams is $49/seat/month.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding('Teams is $49 per seat per year.', 'Teams is $49/seat/year.').ungrounded)
      .toEqual([]);
  });

  it('keeps named owners and material finance qualifiers isolated', () => {
    for (const [claim, source] of [
      ["Acme's revenue is $10,000.", "Beta's revenue is $10,000."],
      ['Average revenue is $10,000.', 'Total revenue is $10,000.'],
      ['Non-recurring revenue is $10,000.', 'Recurring revenue is $10,000.'],
      [
        'Your Pro pricing is $49/month.',
        'Your Pro pricing is $19/month. Your Teams pricing is $49/month.',
      ],
    ]) {
      expect(checkGrounding(claim, source).ungrounded, `${claim} <- ${source}`).toHaveLength(1);
      expect(checkGrounding(claim, claim).ungrounded, claim).toEqual([]);
    }
  });

  it('does not treat coder assignments as finance claims', () => {
    for (const code of [
      'config.revenue = PHP 8.3;',
      'const cfg = { revenue: CAD 2024 };',
      'revenue = PHP 8.3;',
      'pricing = TRY 3;',
      'revenue = PHP 8.3 // runtime version',
      'pricing = TRY 3 # config',
      'revenue = PHP 8.3 /* runtime version */',
      'pricing = TRY 3 -- config',
      '/* revenue = PHP 8.3; */',
      '-- pricing = TRY 3',
      '// revenue = PHP 8.3',
      '# pricing = TRY 3',
      '# revenue = PHP 8.3',
    ]) {
      expect(extractClaimedSpecifics(code).filter(specific => specific.kind === 'money'), code)
        .toEqual([]);
    }
    expect(extractClaimedSpecifics('Revenue = PHP 8.3.').filter(specific => specific.kind === 'money'))
      .toHaveLength(1);
    expect(extractClaimedSpecifics('# Revenue is $10,000.').filter(specific => specific.kind === 'money'))
      .toHaveLength(1);
    expect(extractClaimedSpecifics('## Revenue is $10,000.').filter(specific => specific.kind === 'money'))
      .toHaveLength(1);
  });

  it('separates deltas, levels, and multi-metric compound subjects', () => {
    for (const claim of [
      'Revenue decreased by $10,000.',
      'Revenue dropped by $10,000.',
      'Revenue dropped $10,000.',
      'Revenue grew $10,000.',
      'Revenue dropped about $10,000.',
      'Revenue grew approximately $10,000.',
      'Revenue rose by $10,000.',
      'Revenue increased $10,000.',
      'Revenue fell $10,000.',
    ]) {
      expect(checkGrounding(claim, 'Cash is $10,000; revenue unavailable.').ungrounded, claim)
        .toHaveLength(1);
      expect(checkGrounding(claim, 'Revenue is $10,000.').ungrounded, claim).toHaveLength(1);
      expect(checkGrounding(claim, claim).ungrounded, claim).toEqual([]);
    }
    expect(checkGrounding('Revenue increased to $10,000.', 'Revenue is $10,000.').ungrounded)
      .toEqual([]);
    const compound = 'Cash, revenue, and profit are $10,000.';
    expect(checkGrounding(compound, 'Profit is $10,000; cash and revenue unavailable.').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding(compound, compound).ungrounded).toEqual([]);
  });

  it('preserves invoiced cadence instead of accepting a conflicting period', () => {
    const claim = 'Pricing is $19 invoiced annually.';
    expect(checkGrounding(claim, 'Pricing is $19/month.').ungrounded).toHaveLength(1);
    expect(checkGrounding(claim, 'Pricing is $19/year.').ungrounded).toEqual([]);
  });

  it('rejects hypothetical and comma-qualified questions as source facts', () => {
    for (const source of [
      'Hypothetical: revenue is $10,000.',
      'Assume revenue is $10,000.',
      'For example, revenue is $10,000.',
      'For instance, revenue is $10,000.',
      'Example: revenue is $10,000.',
      'Revenue is $10,000, correct?',
      'Is revenue $10,000, yes or no?',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toHaveLength(1);
    }
    expect(checkGrounding('There are 227 users.', 'Are there 227 users, currently?').ungrounded)
      .toHaveLength(1);
    expect(checkGrounding(
      'Revenue is $10,000.',
      'The example is illustrative, but revenue is $10,000.',
    ).ungrounded).toEqual([]);
    for (const source of [
      'For example, cash could be $5,000, but revenue is $10,000.',
      'For instance, cash could be $5,000, but revenue is $10,000.',
      'For example, cash may vary, but actual revenue is $10,000.',
    ]) {
      expect(checkGrounding('Revenue is $10,000.', source).ungrounded, source).toEqual([]);
    }
  });

  it('does not truncate malformed quantitative claims into different values', () => {
    for (const malformed of [
      'Revenue is $12-34.',
      `Revenue is $1\u200b000.`,
      'There are 1_000 users.',
      'Runway is 1_000 months.',
      'Margin is 1_000%.',
    ]) {
      expect(extractClaimedSpecifics(malformed), malformed).toEqual([]);
    }
  });

  it('normalizes full-width currency and percent symbols with full-width digits', () => {
    const money = extractClaimedSpecifics('Revenue is ＄１０，０００.')
      .filter(specific => specific.kind === 'money');
    expect(money).toHaveLength(1);
    expect(money[0]?.number).toBe('10000');
    expect(checkGrounding('Revenue is ＄１０，０００.', 'Revenue is $10,000.').ungrounded)
      .toEqual([]);

    const percent = extractClaimedSpecifics('Margin is ７３％.')
      .filter(specific => specific.kind === 'percent');
    expect(percent).toHaveLength(1);
    expect(percent[0]?.number).toBe('73');
    expect(checkGrounding('Margin is ７３％.', 'Margin is 73%.').ungrounded).toEqual([]);
  });

  it('keeps repeated subject/value binding within a linear-time budget', () => {
    const sources = `${'revenue '.repeat(5_000)}${'$10,000 '.repeat(5_000)}`;
    const startedAt = performance.now();

    const result = checkGrounding('Revenue is $10,000.', sources);
    const elapsedMs = performance.now() - startedAt;

    expect(result.ungrounded).toEqual([]);
    expect(elapsedMs).toBeLessThan(500);
  });

  it('rejects a huge invalid money token within a bounded time', () => {
    const sources = `$${'9'.repeat(50_000)}/weekly`;
    const startedAt = performance.now();

    const result = checkGrounding('Revenue is $19.', sources);
    const elapsedMs = performance.now() - startedAt;

    expect(result.ungrounded).toHaveLength(1);
    expect(elapsedMs).toBeLessThan(500);
  });

  it('score is 1 when there are no quantitative specifics', () => {
    const r = checkGrounding('Let me help you think this through.', MEMORY);
    expect(r.specifics).toHaveLength(0);
    expect(r.score).toBe(1);
  });

  it('score reflects grounded ratio on a mixed reply', () => {
    // "$19/month" grounded; "4 months runway" + "227 entities" ungrounded → 1/3
    const r = checkGrounding('Pro at $19/month, 4 months runway, 227 entities.', MEMORY);
    expect(r.specifics.length).toBeGreaterThanOrEqual(3);
    expect(r.score).toBeLessThan(0.5);
    expect(r.ungrounded.length).toBeGreaterThanOrEqual(2);
  });
});

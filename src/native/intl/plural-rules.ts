// Intl.PluralRules on CLDR's rules (cldr-plurals.ts), for Hermes, which has
// none. The number is rounded to the options' digits first, as ECMA-402
// does, so `1` with one fraction digit is `1.0`, which English calls other.
// Rounding works on the number's decimal digits, half away from zero as
// ICU's halfExpand, so it gives one answer whatever the platform's
// NumberFormat does.
import {
  CARDINAL_LOCALES,
  CARDINAL_RULES,
  ORDINAL_LOCALES,
  ORDINAL_RULES,
  type PluralCategory,
  type PluralRuleSet,
} from './cldr-plurals';
import {
  defaultLocale,
  digitsOption,
  fallbacks,
  optionsOf,
  requestedLocales,
  stringOption,
  type Locales,
} from './options';

/** CLDR's operands of a formatted number (TR35, Plural Operand Meanings). */
interface Operands {
  /** `i` as written, for whole numbers past 2^53. */
  integer: string;
  n: number;
  i: number;
  v: number;
  w: number;
  f: number;
  t: number;
  c: number;
  e: number;
}

type Operand = Exclude<keyof Operands, 'integer'>;

type Condition = (operands: Operands) => boolean;

const WHAT = 'Intl.PluralRules';

/** How a number rounds: to fraction digits, or to significant ones. */
type Digits =
  | { significant: false; minimum: number; maximum: number }
  | { significant: true; minimum: number; maximum: number };

/** A non-negative number's decimal digits: no exponent, no grouping. */
function plain(value: number): string {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);

  if (!match) return text;

  const [, whole = '', fraction = '', exponent = '0'] = match;
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);

  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);

  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** `text` rounded half up to `places` fraction digits; a negative count rounds whole digits. */
function roundTo(text: string, places: number): string {
  const [whole = '0', fraction = ''] = text.split('.');
  const digits = whole + fraction;
  const kept = whole.length + places;

  if (kept >= digits.length) return text;
  if (kept < 0) return '0';

  const head = digits.slice(0, kept) || '0';
  const up = (digits[kept] ?? '0') >= '5';
  const rounded = up ? (BigInt(head) + 1n).toString().padStart(head.length, '0') : head;
  const integerLength = rounded.length - Math.max(places, 0);
  const integer = places < 0 ? rounded + '0'.repeat(-places) : rounded.slice(0, integerLength);
  const decimals = places > 0 ? rounded.slice(integerLength) : '';

  return decimals ? `${integer}.${decimals}` : integer;
}

/** `value`'s digits as ECMA-402 rounds them for plural rules. */
function rounded(value: number, digits: Digits): string {
  const text = plain(value);

  if (!digits.significant) {
    const [whole = '0', fraction = ''] = roundTo(text, digits.maximum).split('.');
    const decimals = fraction.replace(/0+$/, '').padEnd(digits.minimum, '0');

    return decimals ? `${whole}.${decimals}` : whole;
  }

  const [whole = '0', fraction = ''] = text.split('.');
  const leading = whole.replace(/^0+/, '');
  // Where the first significant digit is, as fraction places before it.
  const magnitude = leading ? leading.length : -(fraction.search(/[1-9]/) + 1 || 1) + 1;
  const result = roundTo(text, digits.maximum - magnitude);
  const [resultWhole = '0', resultFraction = ''] = result.split('.');
  const significant = (resultWhole.replace(/^0+/, '') + resultFraction).replace(/^0+/, '').length;
  const trimmed = resultFraction.replace(/0+$/, '');
  const kept = significant - (resultFraction.length - trimmed.length);
  const padding = Math.max(digits.minimum - Math.max(kept, 1), 0);
  const decimals = trimmed + '0'.repeat(padding);

  return decimals ? `${resultWhole}.${decimals}` : resultWhole;
}

function operandsOf(digits: string): Operands {
  const [integer = '0', fraction = ''] = digits.split('.');
  const trimmed = fraction.replace(/0+$/, '');

  return {
    integer,
    n: Number(digits),
    i: Number(integer),
    v: fraction.length,
    w: trimmed.length,
    f: Number(fraction || '0'),
    t: Number(trimmed || '0'),
    c: 0,
    e: 0,
  };
}

/** `operand % modulus`, exact for the integer part however large. */
function modulo(operands: Operands, name: Operand, modulus: number): number {
  if ((name !== 'n' && name !== 'i') || operands.i <= Number.MAX_SAFE_INTEGER)
    return operands[name] % modulus;

  const whole = Number(BigInt(operands.integer) % BigInt(modulus));

  return name === 'i' ? whole : whole + (operands.n - Math.trunc(operands.n));
}

const RELATION = /^([nivwftce])(?: % (\d+))? (!=|=) (\d+(?:\.\.\d+)?(?:,\d+(?:\.\.\d+)?)*)$/;

/** `i % 10 = 2..4`: a range holds only whole values, a lone value equal ones. */
function relation(text: string): Condition {
  const match = RELATION.exec(text);

  if (!match) throw new Error(`${WHAT}: CLDR's rule "${text}" is not one this engine reads`);

  const [, operand = 'n', modulus, operator, list = ''] = match;
  const name = operand as Operand;
  const ranges = list.split(',').map((range) => range.split('..').map(Number));
  const inList = (value: number) =>
    ranges.some(([low = 0, high = low]) =>
      low === high ? value === low : Number.isInteger(value) && value >= low && value <= high,
    );

  return (operands) => {
    const value = modulus ? modulo(operands, name, Number(modulus)) : operands[name];

    return inList(value) === (operator === '=');
  };
}

function condition(text: string): Condition {
  const alternatives = text
    .split(' or ')
    .map((alternative) => alternative.split(' and ').map(relation));

  return (operands) => alternatives.some((all) => all.every((holds) => holds(operands)));
}

/** Only `other`, for a locale CLDR gives no rules of this type. */
const NO_RULES: PluralRuleSet = [];

const compiled = new Map<PluralRuleSet, readonly (readonly [PluralCategory, Condition])[]>();

function rulesOf(set: PluralRuleSet) {
  let rules = compiled.get(set);

  if (!rules) {
    rules = set.map(([category, text]) => [category, condition(text)] as const);
    compiled.set(set, rules);
  }

  return rules;
}

/** The most specific form of `tag` CLDR has plural rules for. */
function dataLocale(tag: string): string | undefined {
  return fallbacks(tag).find((form) => form in CARDINAL_LOCALES);
}

export class PluralRules {
  static supportedLocalesOf(locales: Locales): string[] {
    return requestedLocales(locales).filter((tag) => dataLocale(tag) !== undefined);
  }

  private readonly options: Intl.ResolvedPluralRulesOptions;
  private readonly rules: readonly (readonly [PluralCategory, Condition])[];
  private readonly digits: Digits;

  constructor(locales?: Locales, options?: Intl.PluralRulesOptions) {
    const bag = optionsOf(options, WHAT);
    const type = stringOption(bag, 'type', ['cardinal', 'ordinal'], 'cardinal', WHAT);
    const locale =
      requestedLocales(locales).map(dataLocale).find(Boolean) ??
      dataLocale(defaultLocale()) ??
      'en';
    const table = type === 'cardinal' ? CARDINAL_LOCALES : ORDINAL_LOCALES;
    const sets = type === 'cardinal' ? CARDINAL_RULES : ORDINAL_RULES;
    const index = fallbacks(locale)
      .map((form) => table[form])
      .find((found) => found !== undefined);
    const minimumIntegerDigits = digitsOption(bag, 'minimumIntegerDigits', 1, 21, 1, WHAT);
    const minimumFractionDigits = digitsOption(bag, 'minimumFractionDigits', 0, 100, 0, WHAT);
    const maximumFractionDigits = digitsOption(
      bag,
      'maximumFractionDigits',
      minimumFractionDigits,
      100,
      Math.max(minimumFractionDigits, 3),
      WHAT,
    );
    const significant =
      bag.minimumSignificantDigits !== undefined || bag.maximumSignificantDigits !== undefined;
    const minimumSignificantDigits = digitsOption(bag, 'minimumSignificantDigits', 1, 21, 1, WHAT);
    const maximumSignificantDigits = significant
      ? digitsOption(bag, 'maximumSignificantDigits', minimumSignificantDigits, 21, 21, WHAT)
      : 21;
    const resolvedDigits = {
      minimumIntegerDigits,
      minimumFractionDigits,
      maximumFractionDigits,
      ...(significant ? { minimumSignificantDigits, maximumSignificantDigits } : {}),
    };
    const rules = rulesOf((index === undefined ? undefined : sets[index]) ?? NO_RULES);

    this.rules = rules;

    this.digits = significant
      ? { significant, minimum: minimumSignificantDigits, maximum: maximumSignificantDigits }
      : { significant, minimum: minimumFractionDigits, maximum: maximumFractionDigits };

    this.options = {
      locale,
      type,
      ...resolvedDigits,
      pluralCategories: [...rules.map(([category]) => category), 'other'],
    };
  }

  select(number: number): Intl.LDMLPluralRule {
    const value = Number(number);

    if (!Number.isFinite(value)) return 'other';

    const operands = operandsOf(rounded(Math.abs(value), this.digits));

    return this.rules.find(([, holds]) => holds(operands))?.[0] ?? 'other';
  }

  resolvedOptions(): Intl.ResolvedPluralRulesOptions {
    return { ...this.options, pluralCategories: [...this.options.pluralCategories] };
  }
}

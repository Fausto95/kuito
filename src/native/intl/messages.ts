// localization.messages: ICU MessageFormat's simple arguments, plural,
// selectordinal and select (docs/localization.md#messages), formatted with
// Intl in the catalog of the user's best language.
import { fallbacks } from './options';

/** The values a message's arguments take, by name. */
export type MessageValues = Readonly<Record<string, string | number | Date>>;

/** Messages by key, in catalogs by BCP 47 tag; the first catalog is the fallback. */
export type MessageCatalogs = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Every key any catalog has. */
export type MessageKey<C extends MessageCatalogs> = { [L in keyof C]: keyof C[L] }[keyof C] &
  string;

type Branches = ReadonlyMap<string, readonly Part[]>;

type Part =
  | string
  | { kind: 'argument'; name: string }
  | { kind: 'number' }
  | { kind: 'plural'; name: string; type: Intl.PluralRuleType; branches: Branches }
  | { kind: 'select'; name: string; branches: Branches };

const SELECTOR = /^(=-?\d+(\.\d+)?|[a-zA-Z][\w-]*)$/;

/** Reads a message into parts; `#` is the number only directly in a plural's branch, as ICU reads it. */
class Parser {
  readonly message: string;
  private at = 0;

  constructor(message: string) {
    this.message = message;
  }

  parse(): Part[] {
    const parts = this.parts(false);

    if (this.at < this.message.length) this.fail('has a } without its {');

    return parts;
  }

  private fail(problem: string): never {
    throw new SyntaxError(`Message "${this.message}" ${problem} (at ${this.at})`);
  }

  /** Up to the } that closes the branch around it, or the end. */
  private parts(inPlural: boolean): Part[] {
    const parts: Part[] = [];
    let text = '';
    const flush = () => {
      if (text) parts.push(text);
      text = '';
    };

    while (this.at < this.message.length) {
      const char = this.message[this.at] ?? '';

      if (char === '}') break;

      if (char === "'") {
        text += this.quoted(inPlural);
      } else if (char === '{') {
        flush();
        parts.push(this.argument());
      } else if (char === '#' && inPlural) {
        flush();
        parts.push({ kind: 'number' });
        this.at++;
      } else {
        text += char;
        this.at++;
      }
    }

    flush();

    return parts;
  }

  /** `''` is an apostrophe; one before {, } or a plural's # quotes up to the next. */
  private quoted(inPlural: boolean): string {
    const next = this.message[this.at + 1];

    if (next === "'") {
      this.at += 2;

      return "'";
    }

    if (next !== '{' && next !== '}' && !(next === '#' && inPlural)) {
      this.at++;

      return "'";
    }

    let text = '';

    this.at++;

    while (this.at < this.message.length) {
      const char = this.message[this.at];

      if (char === "'" && this.message[this.at + 1] === "'") {
        text += "'";
        this.at += 2;
      } else if (char === "'") {
        this.at++;

        return text;
      } else {
        text += char;
        this.at++;
      }
    }

    return text;
  }

  private word(): string {
    this.space();

    const start = this.at;

    while (this.at < this.message.length && !/[\s,{}]/.test(this.message[this.at] ?? '')) this.at++;

    return this.message.slice(start, this.at);
  }

  private space(): void {
    while (/\s/.test(this.message[this.at] ?? '')) this.at++;
  }

  private expect(char: string): void {
    this.space();

    if (this.message[this.at] !== char) this.fail(`needs a ${char}`);

    this.at++;
  }

  private argument(): Part {
    this.at++;

    const name = this.word();

    if (!name) this.fail('has an argument without a name');

    this.space();

    if (this.message[this.at] === '}') {
      this.at++;

      return { kind: 'argument', name };
    }

    this.expect(',');

    const type = this.word();

    if (type !== 'plural' && type !== 'selectordinal' && type !== 'select')
      this.fail(
        `has a ${type || 'missing'} argument; messages take plural, selectordinal and select`,
      );

    this.expect(',');

    const plural = type !== 'select';
    const branches = new Map<string, Part[]>();

    for (this.space(); this.message[this.at] !== '}'; this.space()) {
      if (this.at >= this.message.length) this.fail(`needs a } to close its ${type}`);

      const selector = this.word();

      if (!SELECTOR.test(selector)) this.fail(`has a branch without a selector`);
      if (branches.has(selector)) this.fail(`has two ${selector} branches`);

      this.expect('{');
      branches.set(selector, this.parts(plural));
      this.expect('}');
    }

    this.at++;

    if (!branches.has('other')) this.fail(`is missing a branch: a ${type} needs an other branch`);

    return plural
      ? { kind: 'plural', name, type: type === 'plural' ? 'cardinal' : 'ordinal', branches }
      : { kind: 'select', name, branches };
  }
}

const parsed = new Map<string, readonly Part[]>();
const rules = new Map<string, Intl.PluralRules>();

function pluralRules(locale: string, type: Intl.PluralRuleType): Intl.PluralRules {
  const key = `${locale} ${type}`;
  let found = rules.get(key);

  if (!found) {
    found = new Intl.PluralRules(locale, { type });
    rules.set(key, found);
  }

  return found;
}

function partsOf(message: string): readonly Part[] {
  let parts = parsed.get(message);

  if (!parts) {
    parts = new Parser(message).parse();
    parsed.set(message, parts);
  }

  return parts;
}

function valueOf(message: string, values: MessageValues, name: string) {
  const value = values[name];

  if (value === undefined) throw new TypeError(`"${message}" needs a value for ${name}`);

  return value;
}

function display(value: string | number | Date, locale: string): string {
  if (typeof value === 'number') return new Intl.NumberFormat(locale).format(value);
  if (value instanceof Date) return new Intl.DateTimeFormat(locale).format(value);

  return value;
}

function render(
  message: string,
  parts: readonly Part[],
  values: MessageValues,
  locale: string,
  number: number | undefined,
): string {
  return parts
    .map((part) => {
      if (typeof part === 'string') return part;

      switch (part.kind) {
        case 'argument':
          return display(valueOf(message, values, part.name), locale);
        case 'number':
          return number === undefined ? '#' : display(number, locale);
        case 'select': {
          const key = String(valueOf(message, values, part.name));
          const branch = part.branches.get(key) ?? part.branches.get('other') ?? [];

          return render(message, branch, values, locale, number);
        }
        case 'plural': {
          const value = valueOf(message, values, part.name);

          if (typeof value !== 'number')
            throw new TypeError(`"${message}" needs a number for ${part.name}`);

          const category = pluralRules(locale, part.type).select(value);
          const exact = [...part.branches].find(
            ([selector]) => selector.startsWith('=') && Number(selector.slice(1)) === value,
          );
          const branch =
            exact?.[1] ?? part.branches.get(category) ?? part.branches.get('other') ?? [];

          return render(message, branch, values, locale, value);
        }
      }
    })
    .join('');
}

/** `message` with its arguments filled in for `locale`. */
export function formatMessage(message: string, values: MessageValues, locale: string): string {
  return render(message, partsOf(message), values, locale, undefined);
}

interface Match {
  /** The catalog's tag, as the catalogs spell it. */
  catalog: string;
  /** The user's language it matched: what the message formats for. */
  locale: string;
}

/** The first preferred language a catalog matches, by its tag or a shorter form. */
function match(preferred: readonly string[], available: readonly string[]): Match | undefined {
  const lower = available.map((tag) => tag.toLowerCase());

  for (const locale of preferred) {
    for (const form of fallbacks(locale.toLowerCase())) {
      const catalog = available[lower.indexOf(form)];

      if (catalog !== undefined) return { catalog, locale };
    }
  }

  return undefined;
}

/** The catalog for the first preferred language one matches; else the first. */
export function pickLocale(preferred: readonly string[], available: readonly string[]): string {
  const [first] = available;

  if (first === undefined) throw new TypeError('localization.messages needs at least one catalog');

  return match(preferred, available)?.catalog ?? first;
}

/**
 * Formats a key from the best catalog for `preferred()`, read at each call,
 * for the user's own language (an `en` catalog formats dates as `en-GB` for
 * a British user). A key that catalog lacks comes from its shorter forms
 * (`pt-PT`, then `pt`), then from the first catalog, in that one's language.
 */
export function translator<const C extends MessageCatalogs>(
  catalogs: C,
  preferred: () => readonly string[],
): (key: MessageKey<C>, values?: MessageValues) => string {
  const available = Object.keys(catalogs);
  const first = pickLocale([], available);
  const byLower = new Map(available.map((tag) => [tag.toLowerCase(), tag]));

  return (key, values = {}) => {
    const best = match(preferred(), available) ?? { catalog: first, locale: first };

    for (const form of fallbacks(best.catalog.toLowerCase())) {
      const message = catalogs[byLower.get(form) ?? '']?.[key];

      if (message !== undefined) return formatMessage(message, values, best.locale);
    }

    const message = catalogs[first]?.[key];

    if (message === undefined)
      throw new TypeError(`localization.messages: no catalog has "${key}"`);

    return formatMessage(message, values, first);
  };
}

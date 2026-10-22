/**
 * The native CSS subset as data: `@import`s, `:root`/`@tokens` declarations
 * and `.class` rules, each with the offset it starts at so errors can name
 * the line. Nothing here resolves tokens or values.
 */
import { codeFrame, locate } from '../dev/source-location.ts';
import { parseMedia, type Media } from './media.ts';
import { StyleValueError } from './properties.ts';

export interface Site {
  file: string;
  source: string;
  offset: number;
}

export class KuitoStyleError extends Error {
  declare code: string;
  declare loc?: { file: string; line: number; column: number };
  declare frame?: string;

  /** With a site, the error carries `loc` and a code frame, as Rolldown expects. */
  constructor(file: string, message: string, site?: Site) {
    super('Kuito styles' + (site ? '' : ' (' + file + ')') + ': ' + message);
    this.name = 'KuitoStyleError';
    this.code = 'KUITO_STYLE_ERROR';

    if (site) {
      const position = locate(site.source, site.offset);

      this.loc = { file: site.file, ...position };
      this.frame = codeFrame(site.source, position);
    }
  }
}

export function fail(site: Site, message: string): never {
  throw new KuitoStyleError(site.file, message, site);
}

export function lineOf(site: Site) {
  return site.file + ':' + locate(site.source, site.offset).line;
}

export interface Declaration {
  name: string;
  value: string;
  site: Site;
}

interface Import {
  specifier: string;
  site: Site;
}

/** `[data-size=large]`: the variant of its class a rule declares. */
export interface Variant {
  name: string;
  value: string;
}

interface Rule {
  name: string;
  variant: Variant | null;
  /** The selector, as errors name it: `.card[data-size=large]`. */
  selector: string;
  /** In source order: a later declaration of a property overrides an earlier one. */
  declarations: Declaration[];
  site: Site;
  when: When;
}

/** A `:root` or `@tokens` block. */
interface RootBlock {
  declarations: Declaration[];
  site: Site;
  when: When;
}

export interface Stylesheet {
  imports: Import[];
  root: RootBlock[];
  rules: Rule[];
  blockCount: number;
}

/**
 * Comments become spaces, so every offset still points into `source`. A `/*`
 * inside a string is text, so strings are skipped here as the scanner skips them.
 */
function blankComments(source: string, at: (offset: number) => Site) {
  let text = '',
    index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === '"' || char === "'") {
      const end = stringEnd(source, index, at);

      text += source.slice(index, end);
      index = end;
    } else if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);

      if (end === -1) fail(at(index), 'Unterminated comment');

      text += source.slice(index, end + 2).replace(/[^\n]/g, ' ');
      index = end + 2;
    } else {
      text += char;
      index++;
    }
  }

  return text;
}

/** The offset just past the string that opens at `start`; CSS strings end at a newline. */
function stringEnd(text: string, start: number, at: (offset: number) => Site) {
  const quote = text[start];

  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];

    if (char === '\\') index++;
    else if (char === quote) return index + 1;
    else if (char === '\n') break;
  }

  return fail(at(start), 'Unterminated string');
}

/**
 * The offset of the first of `stops` outside strings and parentheses, or the
 * text's length: `url(a;b)` and `"a;b"` hold no `;`.
 */
function scan(text: string, from: number, stops: string, at: (offset: number) => Site) {
  const opened: number[] = [];

  for (let index = from; index < text.length; index++) {
    const char = text[index];

    if (char === '"' || char === "'") index = stringEnd(text, index, at) - 1;
    else if (char === '(') opened.push(index);
    else if (char === ')') {
      if (opened.pop() === undefined) fail(at(index), 'Unexpected )');
    } else if (stops.includes(char)) {
      const open = opened.pop();

      if (open !== undefined) fail(at(open), 'Missing ) for this (');

      return index;
    }
  }

  const open = opened.pop();

  if (open !== undefined) fail(at(open), 'Missing ) for this (');

  return text.length;
}

/** The text's first non-space offset at or after `from`. */
function skipSpace(text: string, from: number) {
  let index = from;

  while (index < text.length && /\s/.test(text[index])) index++;

  return index;
}

function declarations(text: string, start: number, end: number, at: (offset: number) => Site) {
  const result: Declaration[] = [];

  for (let offset = start; offset < end;) {
    const begin = skipSpace(text, offset);
    // The block's closing `}` is the last stop, so the scan never passes `end`.
    const stop = scan(text, begin, ';}', at);

    offset = stop + 1;
    if (begin >= stop) continue;

    const site = at(begin);
    const statement = text.slice(begin, stop).trim();
    const colon = statement.indexOf(':');

    if (colon < 1) fail(site, 'Expected property: value, got "' + statement + '"');

    const property = statement.slice(0, colon).trim(),
      value = statement.slice(colon + 1).trim();

    if (!value) fail(site, 'Missing value for ' + property);
    result.push({ name: property, value, site });
  }

  return result;
}

const SPECIFIER = /^(?:"([^"]*)"|'([^']*)'|url\(\s*(?:"([^"]*)"|'([^']*)'|([^"'()\s]+))\s*\))$/;

function importSpecifier(raw: string, site: Site) {
  const match = SPECIFIER.exec(raw.trim());
  const specifier = match?.slice(1).find((group) => group !== undefined);

  if (specifier === undefined)
    fail(
      site,
      'Expected @import "<path>"; got "' + raw.trim() + '". Conditions are not supported.',
    );

  if (!specifier || specifier.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(specifier))
    fail(site, '@import takes a relative path, like "./tokens.css"; got "' + specifier + '"');

  return specifier;
}

/** A platform a bundle is built for. */
export type Platform = 'ios' | 'android';

const PLATFORMS: readonly string[] = ['ios', 'android'] satisfies Platform[];

export const isPlatform = (value: string): value is Platform => PLATFORMS.includes(value);

/** What a block applies under: the at-rules around it. */
export interface When {
  platform: Platform | null;
  /** The system state the block applies under; null for always. */
  media: Media | null;
}

const ALWAYS: When = { platform: null, media: null };

/** An `@import …;` statement or a `selector { block }`. */
type Item =
  | { kind: 'import'; source: string; site: Site }
  | { kind: 'block'; selector: string; start: number; end: number; site: Site };

/** The offset of the `}` closing the block that opens at `open`. */
function blockEnd(text: string, open: number, at: (offset: number) => Site) {
  for (let index = open + 1, depth = 1; ; index++) {
    index = scan(text, index, '{}', at);

    if (index === text.length) fail(at(open), 'Missing } for this block');

    if (text[index] === '{') depth++;
    else if (--depth === 0) return index;
  }
}

function* items(
  text: string,
  from: number,
  to: number,
  at: (offset: number) => Site,
  nested: boolean,
): Generator<Item> {
  for (let offset = skipSpace(text, from); offset < to; offset = skipSpace(text, offset)) {
    const site = at(offset);

    if (text.startsWith('@import', offset) && /\s|["'u]/.test(text[offset + 7] ?? '')) {
      const end = scan(text, offset, ';{}', at);

      if (text[end] !== ';') fail(site, 'Expected ; after @import');

      yield { kind: 'import', source: text.slice(offset + 7, end), site };
      offset = end + 1;
      continue;
    }

    const open = scan(text, offset, '{};', at);

    if (nested && text[open] === ';')
      fail(
        site,
        'Expected a rule inside an at-rule, got "' +
          text.slice(offset, open).trim().slice(0, 60) +
          '"',
      );

    if (open >= to || text[open] !== '{')
      fail(
        text[open] === '}' && open < to ? at(open) : site,
        text[open] === '}' && open < to
          ? 'Unexpected }'
          : 'Invalid CSS near "' + text.slice(offset, Math.min(open, to)).trim().slice(0, 60) + '"',
      );

    const close = blockEnd(text, open, at);

    yield {
      kind: 'block',
      selector: text.slice(offset, open).trim(),
      start: open + 1,
      end: close,
      site,
    };

    offset = close + 1;
  }
}

/** `@platform ios`, `@media (…)`: the condition an at-rule adds to `when`. */
function atRule(selector: string, when: When, site: Site): When {
  const [name] = selector.split(/\s/, 1);
  const prelude = selector.slice(name.length).trim();

  if (name === '@media') {
    if (when.media) fail(site, '@media inside @media: join the features with and');

    try {
      return { ...when, media: parseMedia(prelude) };
    } catch (error) {
      if (error instanceof StyleValueError) fail(site, error.message);

      throw error;
    }
  }

  if (name !== '@platform') fail(site, 'Unsupported at-rule ' + name);
  if (when.platform) fail(site, '@platform inside @platform: a block names one platform');
  if (!isPlatform(prelude)) fail(site, '@platform takes ios or android, got "' + prelude + '"');

  return { ...when, platform: prelude };
}

const CLASS = /^\.([a-zA-Z_][a-zA-Z0-9_-]*)((?:\[[^\]]*\])*)$/;
const ATTRIBUTE =
  /^\[\s*data-([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([a-zA-Z0-9_-]+))\s*\]$/;

/** `[data-size=large]`'s name and value; null for a rule without one. */
function variantOf(attributes: string, site: Site): Variant | null {
  if (!attributes) return null;

  if (attributes.indexOf('[', 1) !== -1)
    fail(site, 'A variant rule takes one data- attribute: .card[data-size=large]');

  const match = ATTRIBUTE.exec(attributes);

  if (match) {
    const value = match.slice(2).find((group) => group !== undefined) ?? '';

    return { name: match[1], value };
  }

  if (/^\[\s*data-[^=]*\]$/.test(attributes))
    fail(site, attributes + ' takes a value: [data-size=large]');

  return fail(
    site,
    'Variants are data- attributes, like .card[data-size=large]; got ' + attributes,
  );
}

const sameWhen = (a: When, b: When) =>
  a.platform === b.platform && JSON.stringify(a.media) === JSON.stringify(b.media);

export function parseStylesheet(source: string, file: string): Stylesheet {
  const at = (offset: number): Site => ({ file, source, offset });
  const text = blankComments(source, at);
  const sheet: Stylesheet = { imports: [], root: [], rules: [], blockCount: 0 };

  function read(from: number, to: number, when: When) {
    for (const item of items(text, from, to, at, when !== ALWAYS)) {
      const { site } = item;

      if (item.kind === 'import') {
        if (sheet.blockCount || when !== ALWAYS) fail(site, '@import must come before every rule');
        sheet.imports.push({ specifier: importSpecifier(item.source, site), site });
        continue;
      }

      const { selector } = item;

      if (selector.startsWith('@') && selector !== '@tokens') {
        read(item.start, item.end, atRule(selector, when, site));
        continue;
      }

      if (text[scan(text, item.start, '{}', at)] === '{')
        fail(at(skipSpace(text, item.start)), 'Nested blocks are not supported');

      const values = declarations(text, item.start, item.end, at);

      sheet.blockCount++;

      if (selector === '@tokens' || selector === ':root')
        sheet.root.push({ declarations: values, site, when });
      else if (CLASS.test(selector)) {
        const [, name, attributes] = CLASS.exec(selector) ?? [];
        const variant = variantOf(attributes, site);
        const label = variant
          ? '.' + name + '[data-' + variant.name + '=' + variant.value + ']'
          : '.' + name;

        if (sheet.rules.some((rule) => rule.selector === label && sameWhen(rule.when, when)))
          fail(site, 'Duplicate class ' + label);

        sheet.rules.push({ name, variant, selector: label, declarations: values, site, when });
      } else fail(site, 'Unsupported selector "' + selector + '". Use .class, :root or @tokens.');
    }
  }

  read(0, text.length, ALWAYS);

  return sheet;
}

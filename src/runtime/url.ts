// URL and URLSearchParams after the WHATWG URL standard, for what apps pass
// around: absolute and relative URLs, special and custom schemes, percent-
// encoding, dot segments, default ports. Not here: internationalized domain
// names (pass the xn-- form), IPv4 shorthand like http://0x7f.1, and the
// standard's error recovery for malformed input, which throws instead.
import { decodeUtf8 } from './encoding';
import { host } from './host';
import { own } from './values';

const DEFAULT_PORTS: Record<string, string> = {
  'http:': '80',
  'https:': '443',
  'ws:': '80',
  'wss:': '443',
  'ftp:': '21',
  'file:': '',
};

const isSpecial = (scheme: string) => own(DEFAULT_PORTS, scheme);

interface Parts {
  /** With its colon: 'https:'. */
  scheme: string;
  username: string;
  password: string;
  /** null for a URL without an authority (mailto:x). */
  host: string | null;
  port: string;
  /** Segments of a hierarchical path, or the whole of an opaque one. */
  path: string[] | string;
  query: string | null;
  fragment: string | null;
}

/** The percent-encode sets: which ASCII code points each part escapes. */
const C0 = (code: number) => code < 0x20 || code === 0x7f;
const FRAGMENT = (code: number) => C0(code) || ' "<>`'.includes(String.fromCharCode(code));
const QUERY = (code: number) => C0(code) || ' "#<>'.includes(String.fromCharCode(code));
const SPECIAL_QUERY = (code: number) => QUERY(code) || code === 0x27;
const PATH = (code: number) => QUERY(code) || '?`{}^'.includes(String.fromCharCode(code));
const USERINFO = (code: number) => PATH(code) || '/:;=@[\\]|'.includes(String.fromCharCode(code));

/** Lone surrogates as U+FFFD, so encodeURIComponent never throws. */
function wellFormed(text: string): string {
  let out = '';

  for (let at = 0; at < text.length; at++) {
    const unit = text.charCodeAt(at);

    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(at + 1);

      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[at] + text[at + 1];
        at++;
      } else out += '�';
    } else out += unit >= 0xdc00 && unit <= 0xdfff ? '�' : text[at];
  }

  return out;
}

/** Escapes code points in `set` and everything past ASCII, as UTF-8; leaves `%XX` alone. */
function percentEncode(text: string, set: (code: number) => boolean): string {
  let out = '';

  for (const char of wellFormed(text)) {
    const code = char.charCodeAt(0);

    out += code < 0x80 && !set(code) ? char : encodeURIComponent(char);
  }

  return out;
}

/** `%XX` sequences as UTF-8, invalid bytes as U+FFFD. */
function percentDecode(text: string): string {
  if (!text.includes('%')) return text;

  try {
    return decodeURIComponent(text);
  } catch {
    const bytes: number[] = [];

    for (let at = 0; at < text.length; at++) {
      const hex = text.slice(at + 1, at + 3);

      if (text[at] === '%' && /^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        at += 2;
      } else {
        const char = String.fromCodePoint(text.codePointAt(at) ?? 0xfffd);

        at += char.length - 1;
        utf8Of(char).forEach((byte) => bytes.push(byte));
      }
    }

    return decodeUtf8(Uint8Array.from(bytes));
  }
}

function utf8Of(char: string): number[] {
  return (encodeURIComponent(wellFormed(char)).match(/%[0-9A-F]{2}|./g) ?? []).map((piece) =>
    piece.length === 3 ? parseInt(piece.slice(1), 16) : piece.charCodeAt(0),
  );
}

function failure(input: string, why: string): TypeError {
  return TypeError(`Invalid URL "${input}": ${why}`);
}

const FORBIDDEN_HOST = /[\0\t\n\r #/:<>?@[\\\]^|]/;
const FORBIDDEN_DOMAIN = /[\0\t\n\r #%/:<>?@[\\\]^|\x7f]/;

function parseHost(input: string, text: string, special: boolean): string {
  if (text.startsWith('[')) {
    if (!/^\[[0-9a-fA-F:.]+\]$/.test(text))
      throw failure(input, `"${text}" is not an IPv6 address`);

    return text.toLowerCase();
  }

  if (!special) {
    if (FORBIDDEN_HOST.test(text)) throw failure(input, `"${text}" is not a valid host`);

    return percentEncode(text, C0);
  }

  const domain = percentDecode(text).toLowerCase();

  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(domain))
    throw failure(input, 'internationalized domain names are not supported; use the xn-- form');

  if (!domain || FORBIDDEN_DOMAIN.test(domain))
    throw failure(input, `"${text}" is not a valid host`);

  return domain;
}

function parsePort(input: string, text: string, scheme: string): string {
  if (text === '') return '';

  if (!/^\d+$/.test(text) || Number(text) > 65535)
    throw failure(input, `"${text}" is not a port number`);

  const port = String(Number(text));

  return DEFAULT_PORTS[scheme] === port ? '' : port;
}

/** Path segments with `.` and `..` resolved, each percent-encoded. */
function pathSegments(text: string, special: boolean, base: string[] = []): string[] {
  const segments = base.slice();
  const pieces = (special ? text.replace(/\\/g, '/') : text).split('/');

  pieces.forEach((piece, index) => {
    const last = index === pieces.length - 1;
    const lower = piece.toLowerCase();

    if (lower === '..' || lower === '.%2e' || lower === '%2e.' || lower === '%2e%2e') {
      segments.pop();

      if (last) segments.push('');
    } else if (lower === '.' || lower === '%2e') {
      if (last) segments.push('');
    } else segments.push(percentEncode(piece, PATH));
  });

  return segments;
}

/** Splits off `#fragment` and `?query`, encoding each for `scheme`. */
function splitTail(rest: string, scheme: string) {
  const hash = rest.indexOf('#');
  const fragment = hash === -1 ? null : percentEncode(rest.slice(hash + 1), FRAGMENT);
  const beforeHash = hash === -1 ? rest : rest.slice(0, hash);
  const mark = beforeHash.indexOf('?');
  const query =
    mark === -1
      ? null
      : percentEncode(beforeHash.slice(mark + 1), isSpecial(scheme) ? SPECIAL_QUERY : QUERY);

  return { body: mark === -1 ? beforeHash : beforeHash.slice(0, mark), query, fragment };
}

/** `//authority/path…` after the scheme, or after a scheme-relative reference. */
function parseAuthority(input: string, scheme: string, rest: string): Parts {
  const special = isSpecial(scheme);
  const { body, query, fragment } = splitTail(rest, scheme);
  const end = body.search(special ? /[/\\]/ : /\//);
  const authority = end === -1 ? body : body.slice(0, end);
  const at = authority.lastIndexOf('@');
  const userinfo = at === -1 ? '' : authority.slice(0, at);
  const hostPort = at === -1 ? authority : authority.slice(at + 1);
  const colon = userinfo.indexOf(':');
  const portAt = hostPort.startsWith('[')
    ? hostPort.indexOf(':', hostPort.indexOf(']'))
    : hostPort.lastIndexOf(':');
  const hostText = portAt === -1 ? hostPort : hostPort.slice(0, portAt);
  const path = end === -1 ? '' : body.slice(end + 1);

  if (special && scheme !== 'file:' && !hostText) throw failure(input, 'it has no host');

  return {
    scheme,
    username: percentEncode(colon === -1 ? userinfo : userinfo.slice(0, colon), USERINFO),
    password: colon === -1 ? '' : percentEncode(userinfo.slice(colon + 1), USERINFO),
    host: hostText ? parseHost(input, hostText, special) : '',
    port: portAt === -1 ? '' : parsePort(input, hostPort.slice(portAt + 1), scheme),
    path: end === -1 && !special ? [] : pathSegments(path, special),
    query,
    fragment,
  };
}

function parseAbsolute(input: string, scheme: string, rest: string, base: Parts | null): Parts {
  const special = isSpecial(scheme);

  if (special && base?.scheme === scheme && !/^[/\\]/.test(rest)) return resolve(input, rest, base);

  // file: keeps an empty host: file:///a is host '' and path /a.
  if (scheme === 'file:') return parseAuthority(input, scheme, rest.replace(/^[/\\]{2}/, ''));

  if (special) return parseAuthority(input, scheme, rest.replace(/^[/\\]*/, ''));

  if (rest.startsWith('//')) return parseAuthority(input, scheme, rest.slice(2));

  const { body, query, fragment } = splitTail(rest, scheme);

  return {
    scheme,
    username: '',
    password: '',
    host: null,
    port: '',
    path: body.startsWith('/') ? pathSegments(body.slice(1), false) : percentEncode(body, C0),
    query,
    fragment,
  };
}

function resolve(input: string, reference: string, base: Parts): Parts {
  const special = isSpecial(base.scheme);
  const slash = special ? /^[/\\]/ : /^\//;

  if (typeof base.path === 'string') {
    if (!reference.startsWith('#')) throw failure(input, `it is relative to ${serialize(base)}`);

    return { ...base, fragment: percentEncode(reference.slice(1), FRAGMENT) };
  }

  if (special ? /^[/\\]{2}/.test(reference) : reference.startsWith('//'))
    return parseAuthority(input, base.scheme, reference.slice(2));

  const { body, query, fragment } = splitTail(reference, base.scheme);

  if (slash.test(body))
    return { ...base, path: pathSegments(body.slice(1), special), query, fragment };

  if (body) {
    return {
      ...base,
      path: pathSegments(body, special, base.path.slice(0, -1)),
      query,
      fragment,
    };
  }

  return { ...base, query: query ?? base.query, fragment };
}

function parse(raw: string, base?: string | KuitoURL): Parts {
  // Leading and trailing C0 controls and spaces go, and tabs and newlines anywhere.
  // eslint-disable-next-line no-control-regex
  const input = String(raw)
    .replace(/^[\0- ]+|[\0- ]+$/g, '')
    .replace(/[\t\n\r]/g, '');
  const baseParts =
    base === undefined ? null : base instanceof KuitoURL ? partsOf(base) : parse(String(base));
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(input);

  if (scheme)
    return parseAbsolute(
      raw,
      scheme[1].toLowerCase() + ':',
      input.slice(scheme[0].length),
      baseParts,
    );

  if (!baseParts) throw failure(raw, 'it is relative and has no base');

  return resolve(raw, input, baseParts);
}

function pathname(parts: Parts): string {
  return typeof parts.path === 'string' ? parts.path : '/' + parts.path.join('/');
}

function authority(parts: Parts): string {
  if (parts.host === null) return '';

  const credentials =
    parts.username || parts.password
      ? parts.username + (parts.password ? ':' + parts.password : '') + '@'
      : '';

  return '//' + credentials + parts.host + (parts.port ? ':' + parts.port : '');
}

function serialize(parts: Parts): string {
  const path =
    typeof parts.path === 'string' || parts.path.length || isSpecial(parts.scheme)
      ? pathname(parts)
      : '';

  return (
    parts.scheme +
    authority(parts) +
    path +
    (parts.query === null ? '' : '?' + parts.query) +
    (parts.fragment === null ? '' : '#' + parts.fragment)
  );
}

/** Space as `+`, and everything but `*-._` and alphanumerics escaped. */
function formEncode(text: string): string {
  return encodeURIComponent(wellFormed(text))
    .replace(/[!'()~]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

function formDecode(text: string): string {
  return percentDecode(text.replace(/\+/g, ' '));
}

type SearchInit = string | Iterable<[string, string]> | Record<string, string>;

class KuitoURLSearchParams implements URLSearchParams {
  private list: [string, string][] = [];
  /** The URL whose query this is, kept in step with every change. */
  private owner: { write(query: string): void } | null = null;

  constructor(init: SearchInit = '') {
    if (typeof init === 'string') this.read(init);
    else if (Symbol.iterator in init)
      for (const pair of init) {
        if (!Array.isArray(pair) || pair.length !== 2)
          throw TypeError('Search params pairs are [name, value]');

        this.list.push([String(pair[0]), String(pair[1])]);
      }
    else Object.keys(init).forEach((name) => this.list.push([name, String(init[name])]));
  }

  /** For KuitoURL: replace the list from a query string, or tie it to its URL. */
  static bind(
    params: KuitoURLSearchParams,
    owner: { write(query: string): void },
    query: string,
  ): void {
    params.owner = owner;
    params.read(query);
  }

  static replace(params: KuitoURLSearchParams, query: string): void {
    params.read(query);
  }

  private read(query: string): void {
    this.list = (query.startsWith('?') ? query.slice(1) : query)
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const equals = pair.indexOf('=');

        return equals === -1
          ? [formDecode(pair), '']
          : [formDecode(pair.slice(0, equals)), formDecode(pair.slice(equals + 1))];
      });
  }

  private changed(): void {
    this.owner?.write(this.toString());
  }

  get size(): number {
    return this.list.length;
  }

  append(name: string, value: string): void {
    this.list.push([String(name), String(value)]);
    this.changed();
  }

  delete(name: string, value?: string): void {
    this.list = this.list.filter(
      ([key, entry]) => key !== name || (value !== undefined && entry !== String(value)),
    );

    this.changed();
  }

  get(name: string): string | null {
    const found = this.list.find(([key]) => key === name);

    return found ? found[1] : null;
  }

  getAll(name: string): string[] {
    return this.list.filter(([key]) => key === name).map(([, value]) => value);
  }

  has(name: string, value?: string): boolean {
    return this.list.some(
      ([key, entry]) => key === name && (value === undefined || entry === String(value)),
    );
  }

  set(name: string, value: string): void {
    const at = this.list.findIndex(([key]) => key === name);

    if (at === -1) this.list.push([String(name), String(value)]);
    else {
      this.list[at] = [String(name), String(value)];
      this.list = this.list.filter(([key], index) => key !== name || index <= at);
    }

    this.changed();
  }

  /** Stable, by name in UTF-16 code units. */
  sort(): void {
    this.list = this.list
      .map((pair, index) => ({ pair, index }))
      .sort((a, b) => (a.pair[0] < b.pair[0] ? -1 : a.pair[0] > b.pair[0] ? 1 : a.index - b.index))
      .map(({ pair }) => pair);

    this.changed();
  }

  forEach(callback: (value: string, name: string, params: URLSearchParams) => void): void {
    this.list.slice().forEach(([name, value]) => callback(value, name, this));
  }

  keys(): IterableIterator<string> {
    return this.list.map(([name]) => name)[Symbol.iterator]();
  }

  values(): IterableIterator<string> {
    return this.list.map(([, value]) => value)[Symbol.iterator]();
  }

  entries(): IterableIterator<[string, string]> {
    return this.list.map(([name, value]): [string, string] => [name, value])[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  toString(): string {
    return this.list.map(([name, value]) => formEncode(name) + '=' + formEncode(value)).join('&');
  }
}

const urlParts = new WeakMap<KuitoURL, Parts>();

function partsOf(url: KuitoURL): Parts {
  const parts = urlParts.get(url);

  if (!parts) throw TypeError('Not a URL');

  return parts;
}

class KuitoURL implements URL {
  readonly searchParams: KuitoURLSearchParams;

  constructor(url: string, base?: string | URL) {
    const params = new KuitoURLSearchParams();

    urlParts.set(
      this,
      parse(url, base instanceof KuitoURL ? base : base === undefined ? undefined : String(base)),
    );

    this.searchParams = params;

    KuitoURLSearchParams.bind(
      params,
      {
        write: (query) => {
          partsOf(this).query = query === '' ? null : query;
        },
      },
      partsOf(this).query ?? '',
    );
  }

  static canParse(url: string, base?: string): boolean {
    return KuitoURL.parse(url, base) !== null;
  }

  static parse(url: string, base?: string): URL | null {
    try {
      return new KuitoURL(url, base);
    } catch {
      return null;
    }
  }

  get href(): string {
    return serialize(partsOf(this));
  }

  set href(value: string) {
    urlParts.set(this, parse(value));
    KuitoURLSearchParams.replace(this.searchParams, partsOf(this).query ?? '');
  }

  get origin(): string {
    const parts = partsOf(this);

    return isSpecial(parts.scheme) && parts.scheme !== 'file:'
      ? parts.scheme + '//' + parts.host + (parts.port ? ':' + parts.port : '')
      : 'null';
  }

  get protocol(): string {
    return partsOf(this).scheme;
  }

  /** Only between special schemes, or between custom ones, as the standard allows. */
  set protocol(value: string) {
    const parts = partsOf(this);
    const scheme = String(value).replace(/:.*$/, '').toLowerCase() + ':';

    if (!/^[a-z][a-z0-9+.-]*:$/.test(scheme) || isSpecial(scheme) !== isSpecial(parts.scheme))
      return;

    parts.scheme = scheme;

    if (DEFAULT_PORTS[scheme] === parts.port) parts.port = '';
  }

  get username(): string {
    return partsOf(this).username;
  }

  set username(value: string) {
    const parts = partsOf(this);

    if (parts.host) parts.username = percentEncode(String(value), USERINFO);
  }

  get password(): string {
    return partsOf(this).password;
  }

  set password(value: string) {
    const parts = partsOf(this);

    if (parts.host) parts.password = percentEncode(String(value), USERINFO);
  }

  get host(): string {
    const parts = partsOf(this);

    return (parts.host ?? '') + (parts.port ? ':' + parts.port : '');
  }

  set host(value: string) {
    const parts = partsOf(this);

    if (typeof parts.path === 'string') return;

    const next = parseAuthority(String(value), parts.scheme, String(value));

    parts.host = next.host;
    parts.port = next.port;
  }

  get hostname(): string {
    return partsOf(this).host ?? '';
  }

  set hostname(value: string) {
    const parts = partsOf(this);
    const text = String(value);

    if (typeof parts.path !== 'string') parts.host = parseHost(text, text, isSpecial(parts.scheme));
  }

  get port(): string {
    return partsOf(this).port;
  }

  set port(value: string) {
    const parts = partsOf(this);
    const text = String(value);

    if (parts.host && parts.scheme !== 'file:') parts.port = parsePort(text, text, parts.scheme);
  }

  get pathname(): string {
    return pathname(partsOf(this));
  }

  set pathname(value: string) {
    const parts = partsOf(this);
    const special = isSpecial(parts.scheme);

    if (typeof parts.path !== 'string')
      parts.path = pathSegments(String(value).replace(special ? /^[/\\]/ : /^\//, ''), special);
  }

  get search(): string {
    const { query } = partsOf(this);

    return query ? '?' + query : '';
  }

  set search(value: string) {
    const parts = partsOf(this);
    const text = String(value).replace(/^\?/, '');

    parts.query = text
      ? percentEncode(text, isSpecial(parts.scheme) ? SPECIAL_QUERY : QUERY)
      : null;

    KuitoURLSearchParams.replace(this.searchParams, text);
  }

  get hash(): string {
    const { fragment } = partsOf(this);

    return fragment ? '#' + fragment : '';
  }

  set hash(value: string) {
    const text = String(value).replace(/^#/, '');

    partsOf(this).fragment = text ? percentEncode(text, FRAGMENT) : null;
  }

  toString(): string {
    return this.href;
  }

  toJSON(): string {
    return this.href;
  }
}

/** A form body for fetch: the params serialized, with the form content type. */
export function formBody(body: unknown): string | null {
  return body instanceof KuitoURLSearchParams ? body.toString() : null;
}

export function installUrl(): void {
  host.URL = KuitoURL;
  host.URLSearchParams = KuitoURLSearchParams;
}

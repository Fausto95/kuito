// Headers: names are case-insensitive, iterate lowercased and sorted, and a
// repeated name reads as its values joined by ", ", as the Fetch standard says.
import { host } from './host';
import { dict, own } from './values';

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_VALUE = /[\0\r\n]/;

function headerName(name: unknown): string {
  const text = String(name);

  if (!TOKEN.test(text)) throw TypeError(`Invalid header name "${text}"`);

  return text.toLowerCase();
}

function headerValue(value: unknown): string {
  const text = String(value).trim();

  if (FORBIDDEN_VALUE.test(text)) throw TypeError('Header values cannot hold NUL, CR or LF');

  return text;
}

class KuitoHeaders implements Headers {
  private fields = dict<string>();

  constructor(init?: HeadersInit) {
    if (init == null) return;

    if (init instanceof KuitoHeaders) init.forEach((value, name) => this.append(name, value));
    else if (Array.isArray(init))
      init.forEach((pair) => {
        if (!Array.isArray(pair) || pair.length !== 2)
          throw TypeError('Header pairs are [name, value]');

        this.append(pair[0], pair[1]);
      });
    else if (typeof init === 'object')
      Object.keys(init).forEach((name) => this.append(name, Reflect.get(init, name)));
    else throw TypeError('Headers take Headers, [name, value] pairs or an object');
  }

  append(name: string, value: string): void {
    const key = headerName(name);
    const text = headerValue(value);

    this.fields[key] = own(this.fields, key) ? this.fields[key] + ', ' + text : text;
  }

  set(name: string, value: string): void {
    this.fields[headerName(name)] = headerValue(value);
  }

  get(name: string): string | null {
    const key = headerName(name);

    return own(this.fields, key) ? this.fields[key] : null;
  }

  has(name: string): boolean {
    return own(this.fields, headerName(name));
  }

  delete(name: string): void {
    delete this.fields[headerName(name)];
  }

  forEach(callback: (value: string, name: string, headers: Headers) => void): void {
    this.keys().forEach((name) => callback(this.fields[name], name, this));
  }

  keys(): string[] {
    return Object.keys(this.fields).sort();
  }

  values(): string[] {
    return this.keys().map((name) => this.fields[name]);
  }

  entries(): [string, string][] {
    return this.keys().map((name) => [name, this.fields[name]]);
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries()[Symbol.iterator]();
  }
}

/** `[name, value, name, value, …]`, as the HTTP host takes and gives them. */
export function flatHeaders(headers: Headers): string[] {
  const flat: string[] = [];

  headers.forEach((value, name) => flat.push(name, value));

  return flat;
}

export function headersFrom(flat: string[]): Headers {
  const headers = new KuitoHeaders();

  for (let at = 0; at + 1 < flat.length; at += 2) headers.append(flat[at], flat[at + 1]);

  return headers;
}

export function makeHeaders(init?: HeadersInit): Headers {
  return new KuitoHeaders(init);
}

export function installHeaders(): void {
  host.Headers = KuitoHeaders;
}

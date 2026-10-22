// Reads what the renderers implement out of their Swift, Kotlin and C++
// sources: the keys of each prop table, the kinds each view factory makes and
// the payload keys each emit call sends. A small lexer, not a parser: it
// knows string literals, comments and brackets, which is all the tables and
// emit calls are written with.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Manifest, Platform } from '../../src/protocol/manifest.ts';
import type { ModuleProtocol } from '../../src/protocol/modules.ts';

type Language = 'swift' | 'kotlin';

interface Token {
  type: 'string' | 'word' | 'punct';
  value: string;
  /** Offset in the file, for line numbers in messages. */
  at: number;
}

/** One file's source and where it lives, relative to the repository root. */
export interface Source {
  path: string;
  text: string;
}

export interface PlatformSources {
  language: Language;
  /** The renderer's properties/ directory: one table per concern. */
  properties: Source[];
  factory: Source;
  /** Every renderer file, where events are emitted. */
  renderer: Source[];
  /** The native module host: registry, definition DSL and envelopes. */
  modules: Source[];
}

export interface NativeSources {
  ios: PlatformSources;
  android: PlatformSources;
  /** native/shared/layout/KuitoLayoutStyle.cpp: layout setters and kind defaults. */
  layout: Source;
}

const RENDERERS: Record<
  Platform,
  { language: Language; root: string; factory: string; modules: string }
> = {
  ios: {
    language: 'swift',
    root: 'native/ios/Renderer',
    factory: 'KuitoViewFactory.swift',
    modules: 'native/ios/Modules',
  },
  android: {
    language: 'kotlin',
    root: 'native/android/app/src/main/java/dev/kuito/runtime/renderer',
    factory: 'KuitoViewFactory.kt',
    modules: 'native/android/app/src/main/java/dev/kuito/runtime/modules',
  },
};

function filesUnder(root: string, folder: string, extension: string): Source[] {
  return readdirSync(join(root, folder), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(extension) && !name.includes('.generated.'))
    .sort()
    .map((name) => {
      const path = join(folder, name);

      return { path, text: readFileSync(join(root, path), 'utf8') };
    });
}

export function readNativeSources(root: string): NativeSources {
  const platform = (name: Platform): PlatformSources => {
    const { language, root: folder, factory, modules } = RENDERERS[name];
    const extension = language === 'swift' ? '.swift' : '.kt';
    const renderer = filesUnder(root, folder, extension);
    const find = (path: string) =>
      renderer.find((source) => relative(folder, source.path) === path) ??
      fail(`${folder}/${path} is missing`);

    return {
      language,
      properties: renderer.filter(
        (source) =>
          relative(folder, source.path).startsWith('properties/') ||
          relative(folder, source.path).startsWith('Properties/'),
      ),
      factory: find(factory),
      renderer,
      modules: filesUnder(root, modules, extension),
    };
  };
  const layout = 'native/shared/layout/KuitoLayoutStyle.cpp';

  return {
    ios: platform('ios'),
    android: platform('android'),
    layout: { path: layout, text: readFileSync(join(root, layout), 'utf8') },
  };
}

function fail(message: string): never {
  throw new Error(message);
}

function lineOf(source: Source, at: number): string {
  return `${source.path}:${source.text.slice(0, at).split('\n').length}`;
}

// --- The lexer ----------------------------------------------------------------

const PUNCTUATION = '()[]{}:,=.+?<>';

function tokenize(text: string, language: Language): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  /** Skips a string's body from its opening quote; returns its value. */
  function string(): string {
    const triple = text.startsWith('"""', index);
    let value = '';

    index += triple ? 3 : 1;

    while (index < text.length) {
      if (triple ? text.startsWith('"""', index) : text[index] === '"') {
        index += triple ? 3 : 1;

        return value;
      }

      const char = text[index];

      // An interpolation is code: skip it whole, nested strings included.
      if (
        (language === 'swift' && text.startsWith('\\(', index)) ||
        (language === 'kotlin' && text.startsWith('${', index))
      ) {
        index += 2;
        code(language === 'swift' ? ')' : '}');
        value += '\u0000';
        continue;
      }

      if (char === '\\') {
        value += text[index + 1];
        index += 2;
        continue;
      }

      value += char;
      index++;
    }

    return fail('unterminated string');
  }

  /** Skips code up to the bracket that closes it. */
  function code(close: string): void {
    let depth = 0;

    while (index < text.length) {
      const char = text[index];

      if (char === '"') {
        string();
        continue;
      }

      if (char === '(' || char === '{' || char === '[') depth++;

      if (char === ')' || char === '}' || char === ']') {
        if (depth === 0 && char === close) {
          index++;

          return;
        }

        depth--;
      }

      index++;
    }
  }

  while (index < text.length) {
    const char = text[index];

    if (text.startsWith('//', index)) {
      index = text.indexOf('\n', index);

      if (index === -1) break;

      continue;
    }

    if (text.startsWith('/*', index)) {
      let depth = 0;

      do {
        if (text.startsWith('/*', index)) {
          depth++;
          index += 2;
        } else if (text.startsWith('*/', index)) {
          depth--;
          index += 2;
        } else index++;
      } while (depth > 0 && index < text.length);

      continue;
    }

    if (char === '"') {
      const at = index;

      tokens.push({ type: 'string', value: string(), at });
      continue;
    }

    if (language === 'swift' && text.startsWith('#"', index)) {
      const end = text.indexOf('"#', index + 2);

      tokens.push({ type: 'string', value: text.slice(index + 2, end), at: index });
      index = end + 2;
      continue;
    }

    if (language === 'kotlin' && char === "'") {
      index++;

      while (index < text.length && text[index] !== "'") index += text[index] === '\\' ? 2 : 1;

      index++;
      continue;
    }

    const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(index, index + 80));

    if (word) {
      tokens.push({ type: 'word', value: word[0], at: index });
      index += word[0].length;
      continue;
    }

    if (PUNCTUATION.includes(char)) tokens.push({ type: 'punct', value: char, at: index });

    index++;
  }

  return tokens;
}

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** The index of the token that closes the bracket at `open`. */
function closing(tokens: Token[], open: number): number {
  let depth = 0;

  for (let index = open; index < tokens.length; index++) {
    const { type, value } = tokens[index];

    if (type !== 'punct') continue;

    if (OPEN[value]) depth++;

    if (value === ')' || value === ']' || value === '}') {
      depth--;

      if (depth === 0) return index;
    }
  }

  return fail('unbalanced brackets');
}

// --- Tables -------------------------------------------------------------------

interface Table {
  keys: { name: string; at: number }[];
  /** Where the literal ends in the file. */
  end: number;
  /** Something follows the literal (`.merging(…)`, `+ list`): keys the lexer cannot see. */
  extended: boolean;
}

/** The literal table assigned to `name` (`static let setters … = [ … ]`, `val kinds … = mapOf( … )`). */
function table(source: Source, language: Language, name: string): Table | null {
  const tokens = tokenize(source.text, language);
  const declared = tokens.findIndex(
    (token, index) =>
      token.type === 'word' &&
      token.value === name &&
      ['let', 'val', 'var'].includes(tokens[index - 1]?.value ?? ''),
  );

  if (declared === -1) return null;

  let start = declared;

  while (tokens[start] && tokens[start].value !== '=') start++;

  start++;

  const open = language === 'kotlin' ? start + 1 : start;
  const end = closing(tokens, open);
  const keys: Table['keys'] = [];
  let depth = 0;

  for (let index = open + 1; index < end; index++) {
    const token = tokens[index];

    if (token.type === 'punct' && OPEN[token.value]) depth++;

    if (
      token.type === 'punct' &&
      (token.value === ')' || token.value === ']' || token.value === '}')
    )
      depth--;

    const next = tokens[index + 1];
    const separator =
      language === 'swift' ? next?.value === ':' : next?.type === 'word' && next.value === 'to';

    if (depth === 0 && token.type === 'string' && separator)
      keys.push({ name: token.value, at: token.at });
  }

  const after = tokens[end + 1];

  return {
    keys,
    end: tokens[end].at,
    extended: after?.type === 'punct' && (after.value === '.' || after.value === '+'),
  };
}

/** `KuitoLayoutProperties` → `layout`, `KuitoSafeAreaProperties` → `safeArea`. */
function concernOf(source: Source): string | null {
  const match = /Kuito(\w+)Properties\.(swift|kt)$/.exec(source.path);

  return match ? match[1].charAt(0).toLowerCase() + match[1].slice(1) : null;
}

// --- Events -------------------------------------------------------------------

/**
 * An `emit` call: its events when they are literals, and the generated payload
 * types it sends (docs/events.md#typed-events) when the lexer can tell.
 */
interface Emit {
  at: string;
  /** `__kuito:keyboard` and the like, `constant` for a named one; null for a view. */
  target: string | null;
  /** One event, or each branch of `if (…) "focus" else "blur"`; empty when computed. */
  events: string[];
  /** The `Kuito<Payload>` types it sends, by manifest name: empty for none, null when unknown. */
  payloads: string[] | null;
}

function argumentsOf(tokens: Token[], open: number): [number, number][] {
  const end = closing(tokens, open);
  const ranges: [number, number][] = [];
  let depth = 0;
  let start = open + 1;

  for (let index = open + 1; index < end; index++) {
    const { type, value } = tokens[index];

    if (type === 'punct' && OPEN[value]) depth++;
    if (type === 'punct' && (value === ')' || value === ']' || value === '}')) depth--;

    if (depth === 0 && type === 'punct' && value === ',') {
      ranges.push([start, index]);
      start = index + 1;
    }
  }

  if (start < end) ranges.push([start, end]);

  return ranges;
}

/** The manifest payloads `tokens[start, end)` names as `Kuito<Payload>` types. */
function payloadTypes(
  tokens: Token[],
  [start, end]: [number, number],
  names: Set<string>,
): string[] {
  const found = new Set<string>();

  for (let index = start; index < end; index++) {
    const { type, value } = tokens[index];

    if (type === 'word' && value.startsWith('Kuito') && names.has(value.slice('Kuito'.length)))
      found.add(value.slice('Kuito'.length));
  }

  return [...found];
}

/**
 * The payload types an argument sends: named in it, or in the local
 * function or value it calls or reads (`location(of: touch)`). Null when
 * neither names one: a payload passed through, which its sender names.
 */
function payloadsOf(
  tokens: Token[],
  [start, end]: [number, number],
  names: Set<string>,
): string[] | null {
  const first = tokens[start];

  if (!first || start >= end) return [];

  if (
    first.type === 'word' &&
    (first.value === 'nil' || first.value === 'null') &&
    end === start + 1
  )
    return [];

  // A dictionary or a map literal: no generated payload at all.
  if (['[', 'mapOf', 'mutableMapOf'].includes(first.value)) return ['dictionary'];

  const named = payloadTypes(tokens, [start, end], names);

  if (named.length) return named;

  // `self.location(of: touch)`
  const name =
    first.value === 'self' && tokens[start + 1]?.value === '.' ? tokens[start + 2] : first;
  const declared = tokens.findIndex(
    (token, index) =>
      token.type === 'word' &&
      token.value === name?.value &&
      ['func', 'fun', 'let', 'val', 'var'].includes(tokens[index - 1]?.value ?? ''),
  );

  if (declared === -1) return null;

  // Its declaration up to the end of its body or its line: where its type is named.
  let index = declared + 1;

  while (tokens[index] && tokens[index].value !== '{' && tokens[index].value !== '=') index++;

  const stop = tokens[index]?.value === '{' ? closing(tokens, index) : index + 8;
  const types = payloadTypes(tokens, [declared, Math.min(stop + 1, tokens.length)], names);

  return types.length ? types : null;
}

function emits(source: Source, language: Language, names: Set<string>): Emit[] {
  const tokens = tokenize(source.text, language);
  const found: Emit[] = [];

  tokens.forEach((token, index) => {
    if (token.type !== 'word' || token.value !== 'emit') return;
    if (['func', 'fun', 'var', 'val', 'let'].includes(tokens[index - 1]?.value ?? '')) return;

    // A property access (`style.emit = …`) or a parameter (`emit: (…) -> Unit`) is not a call.
    let open = index + 1;

    if (tokens[open]?.value === '?') open++;

    if (tokens[open]?.value !== '(') return;

    const args = argumentsOf(tokens, open);
    const literals = ([start, end]: [number, number]) => {
      if (end === start + 1 && tokens[start].type === 'string') return [tokens[start].value];

      // Kotlin's `if (focused) "focus" else "blur"`: one literal per branch.
      if (tokens[start].value !== 'if') return null;

      const branches = tokens.slice(closing(tokens, start + 1) + 1, end);

      return branches.every((token) => token.type === 'string' || token.value === 'else')
        ? branches.filter((token) => token.type === 'string').map((token) => token.value)
        : null;
    };
    let position = args.findIndex((range) => literals(range) !== null);
    let target: string | null = null;
    let events = (position === -1 ? null : literals(args[position])) ?? [];
    const [first] = args;

    // The app's events (view 0) name their target first: `emit(0, "keyboard." + event, …)`.
    // The lexer keeps no number tokens, so a literal 0 is an argument with none.
    if (first && first[1] === first[0]) {
      const event = literals(args[1])?.[0];
      const dot = event?.indexOf('.') ?? -1;

      position = 1;
      target = event && dot !== -1 && !event.includes('$') ? event.slice(0, dot) : 'constant';
      events = target === 'constant' || !event ? [] : [event.slice(dot + 1)];
    } else if (position === -1 && args.length >= 3) {
      // `events.emit(ID, phase + "show", payload)`: a target constant and a computed event.
      target = 'constant';
      position = 1;
    }

    const payload = position === -1 ? args[0] : args[position + 1];

    found.push({
      at: lineOf(source, token.at),
      target,
      events,
      payloads: payload ? payloadsOf(tokens, payload, names) : [],
    });
  });

  return found;
}

// --- Drift --------------------------------------------------------------------

function onPlatform(platforms: readonly Platform[] | undefined, platform: Platform): boolean {
  return !platforms || platforms.includes(platform);
}

const sameKeys = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((key, index) => key === [...b].sort()[index]);

/** The payloads an event's kinds send it with; null among them when a kind sends none. */
function eventPayloads(manifest: Manifest, event: string): (string | null)[] {
  return [...new Set(Object.values(manifest.events[event]).map((payload) => payload ?? null))];
}

/**
 * How the renderers differ from the manifest, one message per difference:
 * empty when every platform implements exactly what the manifest says.
 */
export function protocolDrift(manifest: Manifest, sources: NativeSources): string[] {
  const problems: string[] = [];
  const kinds = Object.keys(manifest.kinds);

  for (const platform of ['ios', 'android'] as const) {
    const { language, properties, factory, renderer } = sources[platform];
    const setters = new Map<string, string>();

    for (const source of properties) {
      const concern = concernOf(source);
      const found = table(source, language, 'setters');

      if (!found) continue;

      if (found.extended)
        problems.push(
          `${platform}: ${source.path} builds its setters from more than one literal; list each prop in it`,
        );

      for (const { name, at } of found.keys) {
        if (setters.has(name))
          problems.push(
            `${platform}: ${name} has two setters (${setters.get(name)} and ${lineOf(source, at)})`,
          );

        setters.set(name, lineOf(source, at));

        const spec = Object.hasOwn(manifest.props, name) ? manifest.props[name] : null;

        if (!spec)
          problems.push(
            `${platform}: ${lineOf(source, at)} sets ${name}, which src/protocol/manifest.ts does not list`,
          );
        else if (spec.kernel)
          problems.push(
            `${platform}: ${lineOf(source, at)} sets ${name}, which the kernel consumes`,
          );
        else if (!onPlatform(spec.platforms, platform))
          problems.push(
            `${platform}: ${lineOf(source, at)} sets ${name}, which the manifest does not mark for ${platform}`,
          );
        else if (spec.concern !== concern)
          problems.push(
            `${platform}: ${name} is a ${spec.concern} prop, but its setter is in ${source.path}`,
          );
      }
    }

    for (const [name, spec] of Object.entries(manifest.props))
      if (!spec.kernel && onPlatform(spec.platforms, platform) && !setters.has(name))
        problems.push(`${platform}: ${name} has no setter in the renderer's properties/ tables`);

    const made = table(factory, language, 'kinds');

    if (!made) problems.push(`${platform}: ${factory.path} has no kinds table`);
    else if (
      !sameKeys(
        made.keys.map((key) => key.name),
        kinds,
      )
    )
      problems.push(
        `${platform}: ${factory.path} makes ${made.keys.map((key) => key.name).join(', ')}; the manifest lists ${kinds.join(', ')}`,
      );

    const names = new Set(Object.keys(manifest.payloads));
    // The payloads each event was sent with; an unknown one counts as any.
    const sent = new Map<string, Set<string | null>>();
    const unknown = new Set<string>();

    for (const source of renderer)
      for (const site of emits(source, language, names)) {
        const payloads = site.payloads;

        if (site.target === null) {
          for (const event of site.events) {
            if (!Object.hasOwn(manifest.events, event)) {
              problems.push(
                `${platform}: ${site.at} sends ${event}, which the manifest does not list`,
              );

              continue;
            }

            const seen = sent.get(event) ?? new Set<string | null>();
            const allowed = eventPayloads(manifest, event);

            sent.set(event, seen);

            if (payloads === null) {
              unknown.add(event);

              continue;
            }

            const sends = payloads.length ? payloads : [null];

            for (const payload of sends) {
              seen.add(payload);

              if (!allowed.includes(payload))
                problems.push(
                  `${platform}: ${site.at} sends ${event} with ${payload ?? 'no payload'}; the manifest gives it ${allowed.map((name) => name ?? 'none').join(', ')}`,
                );
            }
          }

          continue;
        }

        if (!payloads?.length) continue;

        const target = site.target;
        const system = Object.hasOwn(manifest.systemEvents, target)
          ? manifest.systemEvents[target]
          : null;
        // A computed event on a named target may be any of the system events' payloads.
        const known =
          target === 'constant'
            ? Object.values(manifest.systemEvents).flatMap((events) => Object.values(events))
            : !system
              ? null
              : site.events.length === 0
                ? Object.values(system)
                : site.events.every((event) => Object.hasOwn(system, event))
                  ? site.events.map((event) => system[event])
                  : null;

        if (!known)
          problems.push(
            `${platform}: ${site.at} sends ${target}.${site.events.join('/')}, which the manifest does not list`,
          );
        else
          for (const payload of payloads)
            if (!known.includes(payload))
              problems.push(
                `${platform}: ${site.at} sends ${payload}, which the manifest gives none of its events`,
              );
      }

    for (const event of Object.keys(manifest.events)) {
      const seen = sent.get(event);

      if (!seen) {
        problems.push(`${platform}: no renderer file sends ${event}`);

        continue;
      }

      if (unknown.has(event)) continue;

      for (const payload of eventPayloads(manifest, event))
        if (!seen.has(payload))
          problems.push(
            `${platform}: no renderer file sends ${event} with ${payload ?? 'no payload'}, which the manifest gives it`,
          );
    }
  }

  problems.push(...layoutDrift(manifest, sources.layout));

  return problems;
}

/** The shared layout engine's setters and per-kind defaults (KuitoLayoutStyle.cpp). */
function layoutDrift(manifest: Manifest, source: Source): string[] {
  const problems: string[] = [];
  const block = (start: string) => {
    const from = source.text.indexOf(start);

    return from === -1
      ? fail(`${source.path} has no ${start}`)
      : source.text.slice(from, source.text.indexOf('\n};', from));
  };
  const table = source.text.indexOf('Setter, kPropCount> table()');
  const body =
    table === -1
      ? fail(`${source.path} has no setter table`)
      : source.text.slice(table, source.text.indexOf('\n}\n', table));
  const setters = [...body.matchAll(/set\(PropKey::(\w+),/g)].map(
    ([, key = '']) => key.charAt(0).toLowerCase() + key.slice(1),
  );
  const expected = Object.entries(manifest.props)
    .filter(([, spec]) => spec.concern === 'layout' || spec.laysOut)
    .map(([name]) => name);

  if (!sameKeys(setters, expected))
    problems.push(
      `${source.path} lays out ${setters.join(', ')}; the manifest's layout props are ${expected.join(', ')}`,
    );

  const kinds = new Map(
    [...block('KindLayout> kinds{').matchAll(/^ {4}\{"(\w+)", \{(.+?)(, true)?\}\},$/gm)].map(
      (match) => [match[1], { layout: match[2], measured: match[3] !== undefined }],
    ),
  );

  for (const [kind, spec] of Object.entries(manifest.kinds)) {
    const found = kinds.get(kind);

    if (!found) problems.push(`${source.path} has no layout defaults for ${kind}`);
    else if (found.layout !== spec.layout || found.measured !== spec.measured)
      problems.push(
        `${source.path} lays out ${kind} as ${found.layout}${found.measured ? ', measured' : ''}; the manifest says ${spec.layout}${spec.measured ? ', measured' : ''}`,
      );
  }

  for (const kind of kinds.keys())
    if (!Object.hasOwn(manifest.kinds, kind))
      problems.push(`${source.path} lays out ${kind}, which the manifest does not list`);

  return problems;
}

const READS_NULL: Record<Language, RegExp> = {
  swift: /\.null\b/,
  kotlin: /\bKuitoValue\.Null\b/,
};

/**
 * Where the renderers decide null themselves instead of following the
 * manifest's `unset` rules: each platform's KuitoProperties must resolve
 * null from KuitoProps.unsetByKey before any setter runs, and the setter of
 * a prop unset to a value (or required) never sees null, so it never reads it.
 */
export function unsetDrift(manifest: Manifest, sources: NativeSources): string[] {
  const problems: string[] = [];

  for (const platform of ['ios', 'android'] as const) {
    const { language, properties } = sources[platform];

    if (!properties.some((source) => source.text.includes('KuitoProps.unsetByKey')))
      problems.push(`${platform}: no properties/ file resolves null through KuitoProps.unsetByKey`);

    for (const source of properties) {
      const found = table(source, language, 'setters');

      found?.keys.forEach(({ name, at }, index) => {
        const spec = Object.hasOwn(manifest.props, name) ? manifest.props[name] : null;
        const body = source.text.slice(at, found.keys[index + 1]?.at ?? found.end);

        if (spec && spec.unset !== 'initial' && READS_NULL[language].test(body))
          problems.push(
            `${platform}: ${lineOf(source, at)} reads null for ${name}, which the manifest unsets to ${spec.unset === 'required' ? 'an error' : JSON.stringify(spec.unset.value)}`,
          );
      });
    }
  }

  return problems;
}

/**
 * How the module hosts differ from src/protocol/modules.ts: they name the
 * host's error codes through the generated KuitoErrorCode, and declare no
 * thread enum of their own.
 */
export function moduleDrift(protocol: ModuleProtocol, sources: NativeSources): string[] {
  const problems: string[] = [];
  const codes = new Map(Object.entries(protocol.errors).map(([name, spec]) => [spec.code, name]));

  for (const platform of ['ios', 'android'] as const) {
    const { language, modules } = sources[platform];

    for (const source of modules) {
      const tokens = tokenize(source.text, language);

      tokens.forEach((token, index) => {
        const code = token.type === 'string' ? codes.get(token.value) : undefined;

        if (code)
          problems.push(
            `${platform}: ${lineOf(source, token.at)} spells ${token.value}; use KuitoErrorCode's ${code}`,
          );

        const declared = tokens[index + (tokens[index + 1]?.value === 'class' ? 2 : 1)];

        if (token.value === 'enum' && /^Kuito(Thread|Queue)$/.test(declared?.value ?? ''))
          problems.push(
            `${platform}: ${lineOf(source, token.at)} declares ${declared.value}; the generated KuitoThread is the one`,
          );
      });
    }
  }

  return problems;
}

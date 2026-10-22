// Symbol names checked when the app compiles (docs/assets.md#symbols): a
// literal `<Symbol name>` or `<Tab icon>` a platform lacks is an error at its
// line, not a blank icon on one device. iOS's names are the SF Symbols the
// Mac's CoreGlyphs lists (an iOS build needs a Mac); Android's are the
// ligatures of the Material Symbols font its shell bundles.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'rolldown';
import { isAstNode, walk, type AstNode } from './ast.ts';
import { parseModule } from './parse.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const MATERIAL_FONT = join(ROOT, 'native/android/app/src/main/res/font/material_symbols.ttf');

const CORE_GLYPHS = '/System/Library/CoreServices/CoreGlyphs.bundle/Contents/Resources';

function tables(view: DataView) {
  const found = new Map<string, number>();

  for (let index = 0; index < view.getUint16(4); index++) {
    const record = 12 + 16 * index;
    const tag = String.fromCharCode(...[0, 1, 2, 3].map((byte) => view.getUint8(record + byte)));

    found.set(tag, view.getUint32(record + 8));
  }

  return found;
}

/** Glyph → the character it draws, from the cmap's format 4 subtables. */
function characters(view: DataView, cmap: number) {
  const drawn = new Map<number, string>();

  for (let index = 0; index < view.getUint16(cmap + 2); index++) {
    const table = cmap + view.getUint32(cmap + 4 + 8 * index + 4);

    if (view.getUint16(table) !== 4) continue;

    const segments = view.getUint16(table + 6) / 2;
    const ends = table + 14;
    const starts = ends + 2 * segments + 2;
    const deltas = starts + 2 * segments;
    const ranges = deltas + 2 * segments;

    for (let segment = 0; segment < segments; segment++) {
      const start = view.getUint16(starts + 2 * segment);
      const end = view.getUint16(ends + 2 * segment);
      const delta = view.getInt16(deltas + 2 * segment);
      const range = view.getUint16(ranges + 2 * segment);

      for (let code = start; code <= end && code !== 0xffff; code++) {
        const at = ranges + 2 * segment + range + 2 * (code - start);
        const glyph = range === 0 ? (code + delta) & 0xffff : view.getUint16(at);
        const mapped = range === 0 || glyph === 0 ? glyph : (glyph + delta) & 0xffff;

        // Upper and lower case share glyphs; names are lower case.
        if (mapped && !drawn.has(mapped))
          drawn.set(mapped, String.fromCharCode(code).toLowerCase());
      }
    }
  }

  return drawn;
}

function coverage(view: DataView, table: number) {
  const glyphs: number[] = [];
  const count = view.getUint16(table + 2);

  if (view.getUint16(table) === 1) {
    for (let index = 0; index < count; index++) glyphs.push(view.getUint16(table + 4 + 2 * index));
  } else {
    for (let index = 0; index < count; index++) {
      const range = table + 4 + 6 * index;

      for (let glyph = view.getUint16(range); glyph <= view.getUint16(range + 2); glyph++)
        glyphs.push(glyph);
    }
  }

  return glyphs;
}

/** Every ligature a font's GSUB forms, as the text that forms it. */
export function ligatures(bytes: Uint8Array): Set<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = tables(view);
  const cmap = found.get('cmap');
  const gsub = found.get('GSUB');
  const names = new Set<string>();

  if (cmap === undefined || gsub === undefined) return names;

  const drawn = characters(view, cmap);
  const text = (glyphs: number[]) => glyphs.map((glyph) => drawn.get(glyph) ?? '�').join('');
  const lookups = gsub + view.getUint16(gsub + 8);

  for (let lookup = 0; lookup < view.getUint16(lookups); lookup++) {
    const table = lookups + view.getUint16(lookups + 2 + 2 * lookup);

    for (let sub = 0; sub < view.getUint16(table + 4); sub++) {
      let subtable = table + view.getUint16(table + 6 + 2 * sub);
      let type = view.getUint16(table);

      // An extension lookup points at its real subtable with a 32-bit offset.
      if (type === 7) {
        type = view.getUint16(subtable + 2);
        subtable += view.getUint32(subtable + 4);
      }

      // Type 4, ligature substitution: per first glyph, its ligatures' other components.
      if (type !== 4) continue;

      coverage(view, subtable + view.getUint16(subtable + 2)).forEach((first, index) => {
        const set = subtable + view.getUint16(subtable + 6 + 2 * index);

        for (let entry = 0; entry < view.getUint16(set); entry++) {
          const ligature = set + view.getUint16(set + 2 + 2 * entry);
          const rest = Array.from({ length: view.getUint16(ligature + 2) - 1 }, (_, component) =>
            view.getUint16(ligature + 4 + 2 * component),
          );

          names.add(text([first, ...rest]));
        }
      });
    }
  }

  return names;
}

const plist = (file: string): unknown =>
  JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));

export interface SymbolNames {
  /** Null where the platform's names cannot be read here: SF Symbols off a Mac. */
  ios: ReadonlySet<string> | null;
  android: ReadonlySet<string> | null;
}

let cached: SymbolNames | null = null;

function sfSymbols(): Set<string> | null {
  if (process.platform !== 'darwin' || !existsSync(CORE_GLYPHS)) return null;

  const available = plist(join(CORE_GLYPHS, 'name_availability.plist'));
  const aliases = plist(join(CORE_GLYPHS, 'name_aliases.strings'));
  const symbols: unknown = Reflect.get(Object(available), 'symbols');

  return new Set([...Object.keys(Object(symbols)), ...Object.keys(Object(aliases))]);
}

/** Both platforms' names, read once per process. */
export function symbolNames(): SymbolNames {
  cached ??= {
    ios: sfSymbols(),
    android: existsSync(MATERIAL_FONT) ? ligatures(readFileSync(MATERIAL_FONT)) : null,
  };

  return cached;
}

const CATALOGS = {
  ios: 'no SF Symbol has that name (developer.apple.com/sf-symbols)',
  android: 'no Material Symbol has that name (fonts.google.com/icons)',
} as const;

type Platform = keyof typeof CATALOGS;

const nameOf = (node: unknown) =>
  isAstNode(node) && typeof node.name === 'string' ? node.name : null;

const stringValue = (node: unknown) =>
  isAstNode(node) && node.type === 'Literal' && typeof node.value === 'string' ? node : null;

/** The attribute each component takes a symbol name in, and whether a platform may go without. */
const COMPONENTS: Readonly<Record<string, { attribute: string; partial: boolean }>> = {
  Symbol: { attribute: 'name', partial: false },
  Tab: { attribute: 'icon', partial: true },
};

/** The literal names an attribute gives, by platform: a string for both, or `{ ios, android }`. */
function named(value: unknown, partial: boolean): { platform: Platform; node: AstNode }[] {
  const expression =
    isAstNode(value) && value.type === 'JSXExpressionContainer' ? value.expression : value;
  const both = stringValue(expression);

  if (both)
    return [
      { platform: 'ios', node: both },
      { platform: 'android', node: both },
    ];

  if (!isAstNode(expression) || expression.type !== 'ObjectExpression') return [];

  const properties = Array.isArray(expression.properties) ? expression.properties : [];

  // An image icon names no symbol.
  if (
    partial &&
    properties.some((property) => isAstNode(property) && nameOf(property.key) === 'uri')
  )
    return [];

  return properties.flatMap((property) => {
    const platform = isAstNode(property) ? nameOf(property.key) : null;
    const node = isAstNode(property) ? stringValue(property.value) : null;

    return (platform === 'ios' || platform === 'android') && node ? [{ platform, node }] : [];
  });
}

/** Local names bound to the components, from `import { Symbol as Icon }`. */
function componentsIn(program: AstNode) {
  const local = new Map<string, string>();

  walk(program, (node) => {
    if (node.type !== 'ImportSpecifier') return;

    const imported = nameOf(node.imported);
    const name = nameOf(node.local);

    if (imported && name && imported in COMPONENTS) local.set(name, imported);
  });

  return local;
}

function check(source: string, file: string, names: SymbolNames) {
  const { root, errors, error } = parseModule(file, source);

  // A syntax error is reported by the bundler itself.
  if (errors.length) return;

  const components = componentsIn(root);

  walk(root, (node) => {
    const component =
      node.type === 'JSXOpeningElement' ? components.get(nameOf(node.name) ?? '') : null;

    if (!component) return;

    const { attribute, partial } = COMPONENTS[component];
    const attributes = Array.isArray(node.attributes) ? node.attributes : [];
    const given = attributes.find((each) => isAstNode(each) && nameOf(each.name) === attribute);

    for (const { platform, node: literal } of named(
      isAstNode(given) ? given.value : null,
      partial,
    )) {
      const known = names[platform];
      const value = String(literal.value);

      if (known && !known.has(value))
        throw error(`<${component} ${attribute}="${value}">: ${CATALOGS[platform]}`, literal.start);
    }
  });
}

export function createSymbolPlugin(names: () => SymbolNames = symbolNames): Plugin {
  return {
    name: 'kuito-symbols',
    transform(source: string, id: string) {
      if (id.startsWith('\0') || !/\.[jt]sx$/.test(id) || !/<\w+[^>]*\b(name|icon)=/.test(source))
        return null;

      check(source, id, names());

      return null;
    },
  };
}

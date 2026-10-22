/**
 * Native CSS: px becomes a platform logical unit (pt/dp), rem is an absolute
 * multiple of the configured root font, and em is compiled to a font-relative
 * numeric instruction resolved against the owning view's inherited font size.
 * The mobile runtime never parses CSS syntax.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'rolldown';
import { expandStyle, length, StyleValueError } from './properties.ts';
import type { NativeProps, StyleContext } from './properties.ts';
import { fail, lineOf, parseStylesheet, KuitoStyleError } from './stylesheet.ts';
import type { Declaration, Platform, Site, Stylesheet, When } from './stylesheet.ts';
import type { Media } from './media.ts';
import { systemSources } from './system-sources.ts';

export { KuitoStyleError };

/** Run a property parser, reporting its error at the declaration. */
function at<T>(site: Site, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof StyleValueError) fail(site, error.message);
    throw error;
  }
}

type Scheme = 'light' | 'dark';

/** A `--token` visible in a stylesheet: declared there or in a file it imports. */
interface Token {
  raw: string;
  site: Site;
  /** What `@media (prefers-color-scheme: …)` redefines it as, beside its declaration. */
  schemes: Partial<Record<Scheme, { raw: string; site: Site }>>;
  /** Set once resolved; a token is resolved in the file that declares it. */
  values: Partial<Record<Scheme, string>>;
}

/** A prop that follows the color scheme: the kernel reads it from `themes` (src/runtime/style-conditions.ts). */
interface TokenMarker {
  __kuitoToken: string;
}

type NativeValue = NativeProps[keyof NativeProps];

type ClassProps = Record<string, NativeValue | TokenMarker>;

/** A class's props under a `@media` query, which win over its own while it holds. */
interface Alternate {
  media: Media;
  props: ClassProps;
}

/** What a stylesheet's classes branch on, which the kernel resolves by system state. */
interface Conditions {
  /** Each token marker's value in the light and the dark scheme. */
  themes: Record<Scheme, Record<string, NativeValue | null>>;
  /** Each class's alternate prop sets, in source order. */
  when: Record<string, Alternate[]>;
  /** Each class's variants: the class each value of each data attribute applies. */
  variants: Record<string, Record<string, Record<string, string>>>;
}

interface RootFontSize {
  size: number;
  site: Site;
}

/** What a stylesheet hands to the stylesheets that `@import` it. */
interface Scope {
  tokens: Map<string, Token>;
  rootFontSize: RootFontSize | null;
  /** Every stylesheet this one imports, directly or not, in discovery order. */
  files: Set<string>;
}

interface CompileOptions extends StyleContext {
  /** The platform the bundle is for: `@platform` blocks for the other one are dropped. */
  platform?: Platform;
  /** Reads an `@import`ed stylesheet by absolute path. Defaults to the file system. */
  read?: (file: string) => string;
}

interface CompiledCSS {
  /** Each token's value, in the light scheme. */
  tokens: Record<string, string>;
  classes: Record<string, ClassProps>;
  conditions: Conditions;
  ruleCount: number;
  rootFontSize: number;
  /** The `:root` font-size declaration in effect, in this file or one it imports. */
  root: Site | null;
  files: string[];
}

function declare(scope: Scope, name: string, token: Token) {
  const existing = scope.tokens.get(name);

  if (existing === token) return;

  if (existing)
    fail(token.site, 'Duplicate token ' + name + ', also declared at ' + lineOf(existing.site));

  scope.tokens.set(name, token);
}

function declareRootFontSize(scope: Scope, root: RootFontSize) {
  const existing = scope.rootFontSize;

  if (existing === root) return;

  if (existing)
    fail(root.site, 'Duplicate :root font-size, also declared at ' + lineOf(existing.site));

  scope.rootFontSize = root;
}

function resolveToken(
  scope: Scope,
  name: string,
  visited: string[],
  site: Site,
  scheme: Scheme,
): string {
  const token = scope.tokens.get(name);

  if (!token) fail(site, 'Unknown token ' + name);

  const resolved = token.values[scheme];

  if (resolved !== undefined) return resolved;

  if (visited.includes(name))
    fail(site, 'Circular CSS token: ' + [...visited, name].map((x) => x.slice(2)).join(' -> '));

  // A token a scheme leaves alone may still be built from one it changes.
  const source = token.schemes[scheme] ?? token;
  const value = resolveTokens(scope, source.raw, [...visited, name], source.site, scheme);

  token.values[scheme] = value;

  return value;
}

// Tokens may appear inside shorthands: `border: 1px solid var(--line)`.
function resolveTokens(scope: Scope, value: string, visited: string[], site: Site, scheme: Scheme) {
  return value.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (_, name: string) =>
    resolveToken(scope, name, visited, site, scheme),
  );
}

/** The scheme a `:root` block's `@media` redefines its tokens for; null for any other query. */
function schemeOf(media: Media): Scheme | null {
  const { colorScheme, ...rest } = media;

  return colorScheme && !Object.keys(rest).length ? colorScheme : null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function compileNativeCSS(
  css: string,
  file = '<css>',
  { rootFontSize = 16, platform, read = (path) => readFileSync(path, 'utf8') }: CompileOptions = {},
): CompiledCSS {
  if (!Number.isFinite(rootFontSize) || rootFontSize <= 0)
    throw new KuitoStyleError(file, 'rootFontSize must be a positive number');

  /** Whether a block applies to the bundle being built. */
  function applies(when: When, site: Site) {
    if (when.platform === null) return true;

    if (!platform)
      fail(site, '@platform needs the platform the bundle is for: compile with { platform }');

    return when.platform === platform;
  }

  // One scope per stylesheet per compile: a file imported twice is the same tokens.
  const scopes = new Map<string, Scope>();

  function load(path: string, specifier: string, site: Site) {
    try {
      return read(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        fail(site, 'Cannot @import ' + specifier + ': ' + path + ' not found');

      throw error;
    }
  }

  function scopeOf(sheet: Stylesheet, chain: string[]): Scope {
    const scope: Scope = { tokens: new Map(), rootFontSize: null, files: new Set() };
    const from = chain[chain.length - 1];

    for (const { specifier, site } of sheet.imports) {
      const path = resolve(dirname(from), specifier);

      if (chain.includes(path)) fail(site, 'Circular @import: ' + [...chain, path].join(' -> '));

      let imported = scopes.get(path);

      if (!imported) {
        imported = scopeOf(parseStylesheet(load(path, specifier, site), path), [...chain, path]);
        scopes.set(path, imported);
      }

      scope.files.add(path);
      for (const nested of imported.files) scope.files.add(nested);
      for (const [name, token] of imported.tokens) declare(scope, name, token);
      if (imported.rootFontSize) declareRootFontSize(scope, imported.rootFontSize);
    }

    let fontSize: Declaration | null = null;

    const root = sheet.root.filter(({ when, site }) => applies(when, site));

    for (const { media, site } of root.map(({ when, site }) => ({ media: when.media, site })))
      if (media && !schemeOf(media))
        fail(
          site,
          'Tokens follow the color scheme alone: a :root block in @media takes only (prefers-color-scheme: light) or (prefers-color-scheme: dark)',
        );

    for (const declaration of root.flatMap((block) =>
      block.when.media ? [] : block.declarations,
    )) {
      const { name, value, site } = declaration;

      if (name === 'font-size') {
        if (fontSize)
          fail(site, 'Duplicate :root font-size, also declared at ' + lineOf(fontSize.site));

        fontSize = declaration;
      } else if (!/^--[a-zA-Z0-9_-]+$/.test(name)) fail(site, 'Token must begin with --: ' + name);
      else declare(scope, name, { raw: value, site, schemes: {}, values: {} });
    }

    for (const block of root) {
      const scheme = block.when.media && schemeOf(block.when.media);

      if (!scheme) continue;

      for (const { name, value, site } of block.declarations) {
        const token = scope.tokens.get(name);

        if (name === 'font-size')
          fail(site, 'font-size cannot change with a condition: declare it in :root alone');

        if (!token || token.site.file !== site.file)
          fail(
            site,
            'Token ' + name + ' has no value outside @media: declare it in :root in this file',
          );

        const existing = token.schemes[scheme];

        if (existing)
          fail(
            site,
            'Duplicate ' +
              scheme +
              ' token ' +
              name +
              ', also declared at ' +
              lineOf(existing.site),
          );

        token.schemes[scheme] = { raw: value, site };
      }
    }

    // Resolve every token here, so an imported token never sees its importer's.
    for (const [name, token] of scope.tokens)
      for (const scheme of ['light', 'dark'] as const)
        resolveToken(scope, name, [], token.site, scheme);

    // CSS's root font-size is fixed at build time. Relative root em/rem values
    // resolve against the initial configured root size, just as a CSS root does.
    if (fontSize) {
      const { site } = fontSize;
      const value = at(site, () =>
        length(resolveTokens(scope, fontSize.value, [], site, 'light'), 'fontSize', {
          rootFontSize,
        }),
      );
      const size = typeof value === 'number' ? value : value.factor * rootFontSize;

      if (!Number.isFinite(size) || size <= 0)
        fail(site, ':root font-size must resolve to a positive length');

      declareRootFontSize(scope, { size, site });
    }

    return scope;
  }

  const sheet = parseStylesheet(css, file);
  const scope = scopeOf(sheet, [resolve(file)]);
  const effectiveRootFontSize = scope.rootFontSize?.size ?? rootFontSize;
  const classes: Record<string, ClassProps> = Object.create(null);
  const conditions: Conditions = {
    themes: { light: Object.create(null), dark: Object.create(null) },
    when: Object.create(null),
    variants: Object.create(null),
  };
  /** What each variant rule sets, to find two variants of a class that both set a prop. */
  const setBy: { name: string; dimension: string; selector: string; site: Site; keys: string[] }[] =
    [];

  /**
   * One declaration's props. A prop whose value differs between the schemes
   * becomes a marker, its two values going to the themes.
   */
  function compile({ name, value, site }: Declaration, conditioned: boolean): ClassProps {
    const expand = (text: string) =>
      at(site, () => expandStyle(name, text, { rootFontSize: effectiveRootFontSize }));
    const light = resolveTokens(scope, value, [], site, 'light');
    const dark = resolveTokens(scope, value, [], site, 'dark');
    const lightProps: Record<string, NativeValue> = expand(light);
    const props: ClassProps = { ...lightProps };

    if (dark !== light) {
      const darkProps: Record<string, NativeValue> = expand(dark);

      for (const prop of new Set([...Object.keys(lightProps), ...Object.keys(darkProps)])) {
        const pair = [lightProps[prop] ?? null, darkProps[prop] ?? null];

        if (same(pair[0], pair[1])) continue;

        // Named by its values: every prop with the same two shares one entry.
        const id = createHash('sha1').update(JSON.stringify(pair)).digest('hex').slice(0, 10);

        conditions.themes.light[id] = pair[0];
        conditions.themes.dark[id] = pair[1];
        props[prop] = { __kuitoToken: id };
      }
    }

    // Children inherit the font size the plan resolves; nothing follows it after.
    if (
      'fontSize' in props &&
      (conditioned ||
        (props.fontSize && typeof props.fontSize === 'object' && '__kuitoToken' in props.fontSize))
    )
      fail(site, 'font-size cannot change with a condition: give each case a class of its own');

    return props;
  }

  // A class's rules apply in source order, its @platform ones among them;
  // an @media rule's props are an alternate set the kernel picks.
  // A variant rule is a class of its own, applied after its class's.
  for (const { name, variant, selector, declarations, site, when } of sheet.rules) {
    if (!applies(when, site)) continue;

    classes[name] ??= {};

    const target = variant ? name + '[' + variant.name + '=' + variant.value + ']' : name;
    let props = (classes[target] ??= {});

    if (variant)
      ((conditions.variants[name] ??= Object.create(null))[variant.name] ??= Object.create(null))[
        variant.value
      ] = target;

    if (when.media) {
      const alternate: Alternate = { media: when.media, props: {} };

      (conditions.when[target] ??= []).push(alternate);
      props = alternate.props;
    }

    const set = declarations.map((declaration) => compile(declaration, !!when.media));

    for (const declared of set) Object.assign(props, declared);

    if (variant)
      setBy.push({
        name,
        dimension: variant.name,
        selector,
        site,
        keys: set.flatMap((declared) => Object.keys(declared)),
      });
  }

  // Two variants of a class may apply at once, and neither is more specific.
  for (const [index, later] of setBy.entries())
    for (const earlier of setBy.slice(0, index)) {
      const key =
        earlier.name === later.name && earlier.dimension !== later.dimension
          ? later.keys.find((name) => earlier.keys.includes(name))
          : undefined;

      if (key)
        fail(
          later.site,
          'Conflicting declarations: ' +
            key +
            ' is set by both ' +
            earlier.selector +
            ' (' +
            lineOf(earlier.site) +
            ') and ' +
            later.selector +
            ', which can apply at once. Set it in one of them.',
        );
    }

  const tokens: Record<string, string> = Object.create(null);

  for (const [name, token] of scope.tokens) tokens[name.slice(2)] = token.values.light ?? token.raw;

  return {
    tokens,
    classes,
    conditions,
    ruleCount: sheet.blockCount,
    rootFontSize: effectiveRootFontSize,
    root: scope.rootFontSize?.site ?? null,
    files: [...scope.files],
  };
}

interface NativeStylePluginOptions {
  platform: Platform;
  onFile?: (path: string) => void;
  rootFontSize?: number;
}

export function createNativeStylePlugin({
  platform,
  onFile,
  rootFontSize = 16,
}: NativeStylePluginOptions): Plugin {
  // Each stylesheet module's :root font-size declaration, this build. The
  // root is the app's: two declarations would make rem mean two things.
  const roots = new Map<string, Site>();

  return {
    name: 'kuito-native-css',
    buildStart() {
      roots.clear();
    },
    async load(id: string) {
      if (!/\.css(?:\?|$)/.test(id)) return null;

      const { readFile } = await import('node:fs/promises');
      const path = id.split('?')[0],
        css = await readFile(path, 'utf8');

      onFile?.(path);

      const output = compileNativeCSS(css, path, { rootFontSize, platform });

      if (output.root) {
        const root = output.root;

        for (const other of roots.values())
          if (other.file !== root.file)
            fail(
              root,
              'Conflicting :root font-size: an app has one root font size, also declared at ' +
                lineOf(other) +
                '. Declare it in one stylesheet and @import that one.',
            );

        roots.set(path, root);
      }

      // A token file may be imported only from CSS; Live Patch must still watch it.
      for (const file of output.files) onFile?.(file);

      const { themes, when, variants } = output.conditions;
      const branches =
        Object.keys(themes.light).length || Object.keys(when).length || Object.keys(variants).length
          ? ',' + JSON.stringify(output.conditions)
          : '';
      const code =
        systemSources(output.conditions) +
        'globalThis.__kuito.installStyles(' +
        JSON.stringify(output.classes) +
        ',' +
        output.rootFontSize +
        branches +
        ');\n' +
        'export default ' +
        JSON.stringify(Object.fromEntries(Object.keys(output.classes).map((k) => [k, k]))) +
        ';';

      return { code, moduleType: 'js' };
    },
  };
}

/**
 * File-based routes (docs/navigation.md): an app directory compiles to the
 * same `<Router>` JSX an app can write by hand, and to the types of its
 * `routes`. Pure: file names and sources in, a route tree, its TSX source and
 * its declarations out; the compiler does the reading and writing.
 */
import type { Node } from 'oxc-parser';
import { parseModule } from './parse.ts';
import { sourceError } from './source-location.ts';

export interface TabSpec {
  name: string;
  title: string;
  /** As `<Tab icon>` takes it: a name, `{ ios, android }` or `{ uri }`. */
  icon?: string | Readonly<Record<string, string>>;
}

/** How a deep link's text parses into a param, as `src/runtime/routes.ts` reads it. */
export type ParamKind = 'string' | 'number' | 'boolean';

export interface ParamSpec {
  kind: ParamKind;
  optional: boolean;
}

/** What a route file declares about itself, as `readRoute` reads it. */
export interface RouteDeclarations {
  /** `export const name`: its key in `routes`, in place of the one its path gives. */
  name: string | null;
  /** `export type Params`, by param; null without one. */
  params: Readonly<Record<string, ParamSpec>> | null;
  /** Whether it exports a `Result` type: what its screen dismisses with. */
  result: boolean;
  /** `options.presentation`: it places the route before its module runs; null for the default. */
  presentation: Presentation | null;
}

export type Presentation = 'push' | 'sheet' | 'modal' | 'fullScreen';

const PRESENTATIONS: readonly unknown[] = ['push', 'sheet', 'modal', 'fullScreen'];

export interface FileRoute {
  /** Relative to the app directory, with `/` separators. */
  file: string;
  path: string;
  /** Its key in `routes`. */
  name: string;
  params: Readonly<Record<string, ParamSpec>>;
  /** Whether `params` comes from the file's `Params` type rather than its path. */
  typed: boolean;
  result: boolean;
  presentation: Presentation | null;
}

export interface FileRouteTree {
  tabs: Array<TabSpec & { routes: FileRoute[] }>;
  /** Routes outside the tab groups: the stack without tabs, or presented routes. */
  routes: FileRoute[];
}

export const LAYOUT = /^_layout\.[jt]sx?$/;

const ROUTE_FILE = /\.[jt]sx$/;
const GROUP = /^\((.+)\)$/;
const PARAMETER = /^\[(\w+)\]$/;
const CATCH_ALL = /^\[\.\.\.(\w+)\]$/;

/** `(name)` for a group directory, else null. */
const groupOf = (segment: string) => GROUP.exec(segment)?.[1] ?? null;

/** A route's path, or null for a file that is not a route. */
function pathOf(file: string): string | null {
  const segments = file.split('/');
  const name = segments.at(-1) ?? '';

  if (!ROUTE_FILE.test(name) || segments.some((part) => /^[_.]/.test(part))) return null;

  segments[segments.length - 1] = name.replace(ROUTE_FILE, '');

  const parts = segments.flatMap((segment, index) => {
    if (groupOf(segment) !== null) return [];
    if (segment === 'index' && index === segments.length - 1) return [];

    const parameter = PARAMETER.exec(segment);

    if (parameter) return [':' + parameter[1]];

    if (CATCH_ALL.test(segment)) {
      if (index !== segments.length - 1)
        throw new Error(file + ': a catch-all [...name] must be the last segment');

      return ['*' + (CATCH_ALL.exec(segment)?.[1] ?? '')];
    }

    if (/[[\]]/.test(segment)) throw new Error(file + ': a [parameter] must be a whole segment');

    return [segment];
  });

  return '/' + parts.join('/');
}

const rank = (segment: string) => (segment.startsWith('*') ? 2 : segment.startsWith(':') ? 1 : 0);

/**
 * The Router takes the first route that matches, and a stack's first route is
 * its root: catch-alls last, then shallower first, static before parameters.
 */
function compareRoutes(a: { path: string }, b: { path: string }): number {
  const left = a.path.split('/').filter(Boolean);
  const right = b.path.split('/').filter(Boolean);
  const catchAll =
    Number(left.at(-1)?.startsWith('*') === true) - Number(right.at(-1)?.startsWith('*') === true);

  if (catchAll || left.length !== right.length) return catchAll || left.length - right.length;

  const differing = left.findIndex((segment, index) => rank(segment) !== rank(right[index]));

  return differing >= 0
    ? rank(left[differing]) - rank(right[differing])
    : a.path.localeCompare(b.path);
}

const NONE: RouteDeclarations = { name: null, params: null, result: false, presentation: null };

const camel = (words: string[]) =>
  words
    .map((word, index) => (index ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join('');

/**
 * The key a path gives a route in `routes`: its static segments, camelCased;
 * a path of params alone is named for them, and `/` is `index`.
 */
function nameOf(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const fixed = segments.filter((segment) => !/^[:*]/.test(segment));
  const words = (fixed.length ? fixed : segments.map((segment) => segment.slice(1))).flatMap(
    (segment) => segment.split(/[-_.]/).filter(Boolean),
  );

  return words.length
    ? camel(words.map((word, index) => (index ? word : word.toLowerCase())))
    : 'index';
}

/** A route's params: its path's, as strings, or as its `Params` type declares them. */
function paramsOf(
  file: string,
  path: string,
  declared: RouteDeclarations['params'],
): Record<string, ParamSpec> {
  const inPath = path
    .split('/')
    .filter((segment) => /^[:*]/.test(segment))
    .map((segment) => segment.slice(1));
  const params: Record<string, ParamSpec> =
    declared ??
    Object.fromEntries(inPath.map((name) => [name, { kind: 'string', optional: false }]));

  for (const name of inPath) {
    if (!(name in params))
      throw new Error(file + ': Params has no ' + name + ", which the file's name gives the path");

    if (params[name].optional)
      throw new Error(file + ': Params.' + name + ' is in the path, so it cannot be optional');
  }

  if ('dismiss' in params)
    throw new Error(
      file + ": a param cannot be named dismiss: the screen's dismiss prop has the name",
    );

  return params;
}

/**
 * The route tree for an app directory's files; `tabs` comes from `_layout`,
 * and `declarations` says what each route file declares about itself.
 */
export function fileRoutes(
  files: readonly string[],
  tabs: readonly TabSpec[] | null,
  declarations: (file: string) => RouteDeclarations = () => NONE,
): FileRouteTree {
  const located = files.flatMap((file) => {
    const path = pathOf(file);

    return path === null ? [] : [{ file, path }];
  });

  if (!located.length) throw new Error('app has no route files: add app/index.tsx');

  const seen = new Map<string, string>();

  for (const route of [...located].sort((a, b) => a.file.localeCompare(b.file))) {
    const other = seen.get(route.path);

    if (other !== undefined)
      throw new Error(other + ' and ' + route.file + ' both route ' + route.path);

    seen.set(route.path, route.file);
  }

  located.sort(compareRoutes);

  const routes: FileRoute[] = located.map(({ file, path }) => {
    const declared = declarations(file);

    return {
      file,
      path,
      name: declared.name ?? nameOf(path),
      params: paramsOf(file, path, declared.params),
      typed: declared.params !== null,
      result: declared.result,
      presentation: declared.presentation,
    };
  });
  const named = new Map<string, string>();

  for (const route of routes) {
    const other = named.get(route.name);

    if (other !== undefined)
      throw new Error(
        other +
          ' and ' +
          route.file +
          ' are both routes.' +
          route.name +
          ": give one its own name with export const name = '…'",
      );

    named.set(route.name, route.file);
  }

  if (!tabs) return { tabs: [], routes };

  const names = new Set(tabs.map((tab) => tab.name));

  for (const route of routes) {
    const group = groupOf(route.file.split('/')[0]);

    if (group !== null && !names.has(group))
      throw new Error(
        'app/(' + group + ') is a top-level group, but _layout.tsx declares no "' + group + '" tab',
      );
  }

  const inTab = (name: string, route: FileRoute) => route.file.startsWith('(' + name + ')/');

  return {
    tabs: tabs.map((tab) => {
      const own = routes.filter((route) => inTab(tab.name, route));

      if (!own.length)
        throw new Error(
          'tab "' + tab.name + '" has no routes: add app/(' + tab.name + ')/index.tsx',
        );

      return { ...tab, routes: own };
    }),
    routes: routes.filter((route) => groupOf(route.file.split('/')[0]) === null),
  };
}

function unwrap(node: Node): Node {
  return node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression'
    ? unwrap(node.expression)
    : node;
}

/** A string literal's value, a template without substitutions included. */
function literal(node: Node): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;

  if (node.type === 'TemplateLiteral' && !node.expressions.length)
    return node.quasis[0]?.value.cooked ?? null;

  return null;
}

export interface Layout {
  /** Null for an app that is one stack. */
  tabs: TabSpec[] | null;
  linking: boolean;
}

/**
 * `_layout`'s exports, read without running it: they are part of the
 * generated tree, so each value is a literal. `tabs` is
 * `[{ name, title, icon }]`, with `icon` a name or an object of `ios`,
 * `android` or `uri` names; `linking` is `true` or `false`.
 */
export function readLayout(source: string, file: string): Layout {
  const { program, errors } = parseModule(file, source);
  const fail = (message: string, node: Node): never => {
    throw sourceError(message, { file, source, start: node.start });
  };

  /** An object literal of string literals, under the keys it may take. */
  const strings = (node: Node, keys: readonly string[], what: string, takes: string) => {
    if (node.type !== 'ObjectExpression') return fail(what + ' must be an object literal', node);

    const entries = node.properties.map((property) => {
      if (property.type !== 'Property' || property.computed)
        return fail(what + ' takes ' + takes, property);

      const key = property.key.type === 'Identifier' ? property.key.name : literal(property.key);

      if (key === null || !keys.includes(key))
        return fail(what + ' takes ' + takes + ', not ' + (key ?? 'that key'), property);

      return [key, property.value] as const;
    });

    return new Map(entries);
  };

  const text = (node: Node, what: string) =>
    literal(node) ?? fail(what + ' must be a string literal', node);

  if (errors[0]) throw new Error(file + ': ' + errors[0].message);

  const declarators = program.body.flatMap((statement) =>
    statement.type === 'ExportNamedDeclaration' &&
    statement.declaration?.type === 'VariableDeclaration'
      ? statement.declaration.declarations
      : [],
  );
  const exported = (name: string) => {
    const init = declarators.find(
      (item) => item.id.type === 'Identifier' && item.id.name === name,
    )?.init;

    return init ? unwrap(init) : null;
  };

  const tabs = exported('tabs');
  const linking = exported('linking');

  if (!tabs && !linking)
    throw new Error(file + ' must export tabs or linking: tabs = [{ name, title, icon }]');

  if (linking && !(linking.type === 'Literal' && typeof linking.value === 'boolean'))
    return fail('linking must be true or false', linking);

  const on = linking?.value === true;

  if (!tabs) return { tabs: null, linking: on };

  if (tabs.type !== 'ArrayExpression') return fail('tabs must be an array literal', tabs);

  return {
    linking: on,
    tabs: tabs.elements.map((element) => {
      if (!element) return fail('a tab must be an object literal', tabs);

      const tab = strings(element, ['name', 'title', 'icon'], 'a tab', 'name, title and icon');
      const name = tab.get('name');
      const title = tab.get('title');
      const icon = tab.get('icon');

      if (!name) return fail('a tab needs a name', element);
      if (!title) return fail('a tab needs a title', element);

      return {
        name: text(name, "a tab's name"),
        title: text(title, "a tab's title"),
        ...(icon && {
          icon:
            literal(icon) ??
            Object.fromEntries(
              [
                ...strings(icon, ['ios', 'android', 'uri'], 'a tab icon', 'ios, android or uri'),
              ].map(([key, value]) => [key, text(value, 'a tab icon ' + key)]),
            ),
        }),
      };
    }),
  };
}

const KEYWORD_KINDS: Readonly<Record<string, ParamKind>> = {
  TSStringKeyword: 'string',
  TSNumberKeyword: 'number',
  TSBooleanKeyword: 'boolean',
};

/**
 * What a route file declares about itself, read without running it:
 * `export type Params` (or an interface) as a type literal of `string`,
 * `number` and `boolean` members, whether it exports a `Result` type, and
 * `export const name`, a string literal.
 */
export function readRoute(source: string, file: string): RouteDeclarations {
  const { program, errors } = parseModule(file, source);
  const fail = (message: string, node: Node): never => {
    throw sourceError(message, { file, source, start: node.start });
  };

  if (errors[0]) throw new Error(file + ': ' + errors[0].message);

  const declarations = program.body.flatMap((statement) =>
    statement.type === 'ExportNamedDeclaration' && statement.declaration
      ? [statement.declaration]
      : [],
  );
  const type = (name: string) =>
    declarations.find(
      (node) =>
        (node.type === 'TSTypeAliasDeclaration' || node.type === 'TSInterfaceDeclaration') &&
        node.id.name === name,
    );

  const members = (node: Node): readonly Node[] => {
    if (node.type === 'TSInterfaceDeclaration') return node.body.body;

    if (node.type === 'TSTypeAliasDeclaration' && node.typeAnnotation.type === 'TSTypeLiteral')
      return node.typeAnnotation.members;

    return fail('Params must be a type literal, like { id: number }', node);
  };

  const declaredParams = type('Params');
  const params = declaredParams
    ? Object.fromEntries(
        members(declaredParams).map((member) => {
          if (member.type !== 'TSPropertySignature' || member.computed)
            return fail('Params takes named members, like id: number', member);

          const key = member.key.type === 'Identifier' ? member.key.name : literal(member.key);
          const annotation = member.typeAnnotation?.typeAnnotation;

          if (key === null) return fail('Params takes named members, like id: number', member);

          const kind = annotation ? KEYWORD_KINDS[annotation.type] : undefined;

          if (!annotation || !kind)
            return fail(
              'Params.' +
                key +
                ' must be string, number or boolean: a deep link carries it as text',
              annotation ?? member,
            );

          return [key, { kind, optional: member.optional }];
        }),
      )
    : null;

  const exported = (wanted: string) =>
    program.body
      .flatMap((statement) =>
        statement.type === 'ExportNamedDeclaration' &&
        statement.declaration?.type === 'VariableDeclaration'
          ? statement.declaration.declarations
          : [],
      )
      .find((item) => item.id.type === 'Identifier' && item.id.name === wanted)?.init;
  const nameInit = exported('name');
  const name = nameInit
    ? (literal(unwrap(nameInit)) ?? fail('name must be a string literal', nameInit))
    : null;

  if (name !== null && nameInit && !/^[A-Za-z_$][\w$]*$/.test(name))
    fail("name must be an identifier, like 'shows'", nameInit);

  return { name, params, result: type('Result') !== undefined, presentation: presentationOf() };

  /** `options.presentation`, which the Router needs before the route's module runs. */
  function presentationOf(): Presentation | null {
    const init = exported('options');

    if (!init) return null;

    const options = unwrap(init);

    if (options.type !== 'ObjectExpression')
      return fail(
        'options must be an object literal: the compiler reads its presentation',
        options,
      );

    const property = options.properties.find(
      (each) =>
        each.type === 'Property' &&
        !each.computed &&
        (each.key.type === 'Identifier' ? each.key.name : literal(each.key)) === 'presentation',
    );

    if (!property || property.type !== 'Property') return null;

    const value = literal(property.value);

    return PRESENTATIONS.includes(value)
      ? (value as Presentation)
      : fail(
          "presentation must be 'push', 'sheet', 'modal' or 'fullScreen', as a literal",
          property.value,
        );
  }
}

/** A JSX attribute: a string as written when JSX can hold it, else an expression. */
function attribute(name: string, value: TabSpec['icon']): string {
  const json = JSON.stringify(value);

  return typeof value === 'string' && !json.includes('\\')
    ? ` ${name}=${json}`
    : ` ${name}={${json}}`;
}

const PARAM_TYPES: Readonly<Record<ParamKind, string>> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
};

const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

/** `params={{ id: Number }}`: how a deep link's text parses into each param, if it has any. */
function paramTypes(spec: FileRoute): string {
  const entries = Object.entries(spec.params);

  return entries.length
    ? ` params={{ ${entries.map(([name, param]) => `${key(name)}: ${PARAM_TYPES[param.kind]}`).join(', ')} }}`
    : '';
}

/** The chunk a route's module compiles to (src/runtime/chunks.ts). */
export const routeChunk = (route: FileRoute) => 'route-' + route.name;

/**
 * The app module: the Router tree, each route under the name and path its
 * file gives, its module loaded from its chunk when the route first shows
 * (its default export is the screen, its `options` the rest of the Route).
 */
export function routeSource(
  tree: FileRouteTree,
  { ui, linking = false }: { ui: string; linking?: boolean },
): string {
  const route = (spec: FileRoute, indent: string) =>
    `${indent}<Route${attribute('name', spec.name)}${attribute('path', spec.path)}${paramTypes(spec)}${
      spec.presentation ? attribute('presentation', spec.presentation) : ''
    } load={load(${JSON.stringify(routeChunk(spec))})} />`;
  const tabs = tree.tabs.length
    ? [
        '      <Tabs>',
        ...tree.tabs.flatMap((tab) => [
          '        <Tab' +
            attribute('name', tab.name) +
            attribute('title', tab.title) +
            (tab.icon === undefined ? '' : attribute('icon', tab.icon)) +
            '>',
          ...tab.routes.map((spec) => route(spec, '          ')),
          '        </Tab>',
        ]),
        '      </Tabs>',
      ]
    : [];

  return [
    `import { Route, Router${tree.tabs.length ? ', Tab, Tabs' : ''} } from ${JSON.stringify(ui)};`,
    '',
    "// Each route's module is a chunk of its own, evaluated the first time the route shows.",
    'const load = (chunk) => () => globalThis.__kuito.requireChunk(chunk);',
    '',
    'export default function App() {',
    '  return (',
    linking ? '    <Router linking>' : '    <Router>',
    ...tabs,
    ...tree.routes.map((spec) => route(spec, '      ')),
    '    </Router>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/** The file the compiler writes the route types to, in the app directory. */
export const ROUTE_TYPES = 'routes.generated.d.ts';

/** A route file as a module specifier from the app directory: `./show/[id]`. */
const specifier = (file: string) => JSON.stringify('./' + file.replace(ROUTE_FILE, ''));

/**
 * The declarations of an app directory's `routes`, written beside its route
 * files: each route's params, from its `Params` type or its path, and its
 * screen's result, from its `Result` type.
 */
export function routeTypes(tree: FileRouteTree, { ui }: { ui: string }): string {
  const routes = [...tree.tabs.flatMap((tab) => tab.routes), ...tree.routes];
  const params = (route: FileRoute) => {
    if (route.typed) return `import(${specifier(route.file)}).Params`;

    const entries = Object.entries(route.params);

    return entries.length
      ? `{ ${entries.map(([name, param]) => `${JSON.stringify(name)}: ${param.kind}`).join('; ')} }`
      : '{}';
  };
  const member = (route: FileRoute) =>
    `    ${JSON.stringify(route.name)}: RouteTo<${params(route)}${route.result ? `, import(${specifier(route.file)}).Result` : ''}>;`;

  return [
    "// Generated by Kuito from this directory's route files (docs/navigation.md). Do not edit.",
    `import type { RouteTo } from ${JSON.stringify(ui)};`,
    '',
    `declare module ${JSON.stringify(ui)} {`,
    '  interface Routes {',
    ...routes.map(member),
    '  }',
    '}',
    '',
  ].join('\n');
}

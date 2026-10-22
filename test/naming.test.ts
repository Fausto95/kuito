// docs/naming.md is the naming table Phase 7's rename works from: every public
// name with its proposed name. This test keeps it complete: every name an app
// can reach (the package's entry points, their module objects' members, the
// props of their components, the members of their option and value types,
// and the manifest's typed props and event props) needs a row whose first
// column names it.
import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { EVENT_PROPS, EVENTS, KINDS, PROPS, type Kind } from '../src/protocol/manifest.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg: { exports: Record<string, string> } = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
);

type AstNode = { type: string; [key: string]: unknown };

const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string';

const nodes = (value: unknown): AstNode[] => (Array.isArray(value) ? value.filter(isNode) : []);

const field = (node: AstNode, key: string): AstNode | undefined => {
  const value = node[key];

  return isNode(value) ? value : undefined;
};

const nameOf = (node: AstNode | undefined): string | undefined => {
  if (!node) return undefined;
  if (node.type === 'Identifier' && typeof node.name === 'string') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;

  return undefined;
};

function resolveSource(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.d.ts`, `${base}/index.ts`])
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;

  throw new Error(`${from}: cannot resolve ${specifier}`);
}

const programs = new Map<string, AstNode[]>();

function body(file: string): AstNode[] {
  let statements = programs.get(file);

  if (!statements) {
    const { program, errors } = parseSync(file, readFileSync(file, 'utf8'));

    if (errors.length) throw new Error(`${file}: ${errors[0]?.message}`);
    statements = nodes(program.body);
    programs.set(file, statements);
  }

  return statements;
}

/** Declarations of `file` by local name, exported or not. */
function declarations(file: string): Map<string, AstNode> {
  const found = new Map<string, AstNode>();

  for (const statement of body(file)) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? field(statement, 'declaration') : statement;

    if (!declaration) continue;

    if (declaration.type === 'VariableDeclaration')
      for (const declarator of nodes(declaration.declarations)) {
        const name = nameOf(field(declarator, 'id'));

        if (name) found.set(name, declarator);
      }
    else {
      const name = nameOf(field(declaration, 'id'));

      if (name) found.set(name, declaration);
    }
  }

  return found;
}

/** The local name of a namespace export, `export * as name from`, which no declaration has. */
const NAMESPACE = '*';

/** The names a file exports, each with the file and local name that defines it. */
function exportsOf(file: string): Map<string, { file: string; local: string }> {
  const found = new Map<string, { file: string; local: string }>();

  for (const statement of body(file)) {
    if (!statement.type.startsWith('Export')) continue;

    const source = field(statement, 'source');
    const module = typeof source?.value === 'string' ? source.value : undefined;
    // Another package's names (`node:test` for kuito/tests) are its own: their row names them.
    const external = module !== undefined && !module.startsWith('.');
    const from = module !== undefined && !external ? resolveSource(file, module) : undefined;

    const namespace = nameOf(field(statement, 'exported'));

    if (statement.type === 'ExportAllDeclaration' && from && namespace)
      found.set(namespace, { file: from, local: NAMESPACE });
    else if (statement.type === 'ExportAllDeclaration' && from)
      for (const [name, origin] of exportsOf(from)) found.set(name, origin);

    if (statement.type !== 'ExportNamedDeclaration') continue;

    for (const specifier of nodes(statement.specifiers)) {
      const exported = nameOf(field(specifier, 'exported'));
      const local = nameOf(field(specifier, 'local'));

      if (!exported || !local) continue;

      found.set(
        exported,
        external
          ? { file: module, local }
          : from
            ? (exportsOf(from).get(local) ?? { file: from, local })
            : { file, local },
      );
    }

    const declaration = field(statement, 'declaration');

    if (!declaration) continue;

    const named =
      declaration.type === 'VariableDeclaration'
        ? nodes(declaration.declarations).map((declarator) => field(declarator, 'id'))
        : [field(declaration, 'id')];

    for (const id of named) {
      const name = nameOf(id);

      if (name) found.set(name, { file, local: name });
    }
  }

  return found;
}

const keysOf = (object: AstNode): string[] =>
  nodes(object.properties).flatMap((property) => nameOf(field(property, 'key')) ?? []);

/**
 * The member signatures an object type spells out: an object literal's, and
 * each object literal's in an intersection or union (`AlertOptions & { … }`).
 */
function literalMembers(type: AstNode | undefined): AstNode[] {
  if (type?.type === 'TSTypeLiteral') return nodes(type.members);

  if (type?.type === 'TSIntersectionType' || type?.type === 'TSUnionType')
    return nodes(type.types).flatMap(literalMembers);

  return [];
}

/** The member signatures of an interface or an object type alias. */
const memberNodes = (declaration: AstNode | undefined): AstNode[] =>
  declaration?.type === 'TSInterfaceDeclaration'
    ? nodes(field(declaration, 'body')?.body)
    : declaration?.type === 'TSTypeAliasDeclaration'
      ? literalMembers(field(declaration, 'typeAnnotation'))
      : [];

const typeMembers = (declaration: AstNode | undefined): string[] =>
  memberNodes(declaration).flatMap((member) => nameOf(field(member, 'key')) ?? []);

const hasMethods = (declaration: AstNode): boolean =>
  memberNodes(declaration).some((member) => member.type === 'TSMethodSignature');

/** The members of the type a call's first type argument names (`nativeView<Spec>`). */
function typeArgumentMembers(call: AstNode, file: string): string[] {
  const argument = nodes(field(call, 'typeArguments')?.params)[0];
  const name = argument && nameOf(field(argument, 'typeName'));

  return name ? typeMembers(declarations(file).get(name)) : [];
}

/**
 * What an export brings besides its own name: a module object's members
 * (`Haptics.impact`), a native module spec's functions, an API type's members
 * (`CameraMethods.takePicture`), and the props of a props type or a native
 * view (bare: one row covers a prop on every component that takes it).
 */
function membersOf(name: string, origin: { file: string; local: string }): string[] {
  if (!isAbsolute(origin.file)) return [];
  if (origin.local === NAMESPACE) return namespaceMembers(name, origin.file);

  const declaration = declarations(origin.file).get(origin.local);

  if (!declaration) return [];

  if (declaration.type !== 'VariableDeclarator') {
    // A native module's spec and the runtime's glue are covered by the object they type.
    if (/(Module|Runtime)$/.test(name)) return [];

    // An object type with methods is an API (AudioPlayer.seekTo).
    if (!name.endsWith('Props') && hasMethods(declaration))
      return typeMembers(declaration).map((member) => `${name}.${member}`);

    // Props, options and values: an app writes or reads each member by name.
    return typeMembers(declaration);
  }

  const init = field(declaration, 'init');

  if (init?.type === 'ObjectExpression') return keysOf(init).map((key) => `${name}.${key}`);
  if (init?.type !== 'CallExpression') return [];

  const callee = nameOf(field(init, 'callee'));

  if (callee === 'nativeView') return typeArgumentMembers(init, origin.file);

  if (callee === 'nativeModule')
    return typeArgumentMembers(init, origin.file).map((member) => `${name}.${member}`);

  const object = nodes(init.arguments).findLast((argument) => argument.type === 'ObjectExpression');

  return object ? keysOf(object).map((key) => `${name}.${key}`) : [];
}

/** Whether a declaration is a type, which a namespace's members leave to the types' rows. */
const isType = ({ file, local }: { file: string; local: string }): boolean =>
  isAbsolute(file) && (declarations(file).get(local)?.type.startsWith('TS') ?? false);

/**
 * A capability namespace's values, as `haptics.impact`; its types have rows of
 * their own. A capability of one function (`share`) is that function.
 */
function namespaceMembers(namespace: string, file: string): string[] {
  return [...exportsOf(file)]
    .filter(([, origin]) => !isType(origin))
    .map(([member]) => (member === namespace ? member : `${namespace}.${member}`));
}

/** `./native/file-system` is the `fileSystem` namespace on its own. */
const capability = (entry: string): string | null => {
  const [, name] = /^\.\/native\/(.+)$/.exec(entry) ?? [];

  return name ? name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase()) : null;
};

function packageNames(): Set<string> {
  const names = new Set<string>();

  for (const [subpath, entry] of Object.entries(pkg.exports)) {
    const namespace = capability(subpath);

    if (namespace) {
      for (const member of namespaceMembers(namespace, resolve(root, entry))) names.add(member);
      continue;
    }

    for (const [name, origin] of exportsOf(resolve(root, entry))) {
      names.add(name);
      for (const member of membersOf(name, origin)) names.add(member);
    }
  }

  return names;
}

function manifestNames(): Set<string> {
  const primitive = (kind: string) => kind === 'all' || KINDS[kind as Kind]?.primitive === true;
  const names = new Set<string>();

  for (const [name, spec] of Object.entries(PROPS)) {
    if (spec.internal) continue;
    names.add(name);
    for (const alias of Object.values(spec.aliases ?? {})) if (alias) names.add(alias.name);
  }

  for (const [name, spec] of Object.entries(EVENT_PROPS)) {
    const event = EVENTS[spec.event.replace(/:capture$/, '')] ?? {};

    if (Object.keys(event).some(primitive)) names.add(name);
  }

  return names;
}

/**
 * Names an app reaches through option and value types that docs/naming.md
 * has no row for yet, by the type that brings them. Most are borrowed from
 * React Native, Expo or React Native Gesture Handler (`keyboardType`);
 * others may keep their name. This list is the
 * pending Phase 4 rename: each name leaves it in the change that gives it a
 * row, renamed or kept, and the test fails on a name that left the API or
 * gained a row while still listed here.
 */
const pendingPhase4Renames: Record<string, readonly string[]> = {
  // 4.1: prompt() and its field
  // 4.2: Navigation's presentations and header
  'Destination, ScreenProps': ['route', 'resultType', 'dismiss'],
};

/**
 * Every name in docs/naming.md's tables: the first column's, and the second's,
 * since the rename applied them. In the second, a call's arguments drop
 * (`clipboard.readText()`), and a bare name after a qualified one shares its
 * namespace (`storage.get`, `set` names `storage.set`).
 */
function documentedNames(): Set<string> {
  const names = new Set<string>();

  for (const line of readFileSync(resolve(root, 'docs/naming.md'), 'utf8').split('\n')) {
    const [, first = '', second = ''] = /^\|([^|]*)\|([^|]*)\|/.exec(line) ?? [];
    let namespace = '';

    for (const [, name] of first.matchAll(/`([^`]+)`/g)) {
      if (!name) continue;

      names.add(name);
      // A module's kept member moves with its namespace: `Device.brand` is `device.brand`.

      if (/^keep\b/.test(second.trim()))
        names.add(
          name.replace(/^[A-Z][A-Za-z]*(?=\.)/, (head) => head[0].toLowerCase() + head.slice(1)),
        );
    }

    for (const [, written] of second.matchAll(/`([^`]+)`/g)) {
      const name = (written ?? '').replace(/\(.*\)$/, '');
      const dot = name.lastIndexOf('.');

      if (dot > 0) namespace = name.slice(0, dot + 1);
      names.add(name);
      if (dot === -1 && namespace) names.add(namespace + name);
    }
  }

  return names;
}

/** Not Kuito's names: the runtime's brands (`__kuitoSource`) and another spec's keys (`~standard`). */
const isForeign = (name: string) => /^(__|~)/.test(name);

test('docs/naming.md has a row for every public name', () => {
  const documented = documentedNames();
  const pending = new Set(Object.values(pendingPhase4Renames).flat());
  const names = new Set([...packageNames(), ...manifestNames()]);
  const missing = [...names]
    .filter((name) => !documented.has(name) && !pending.has(name) && !isForeign(name))
    .sort();
  const settled = [...pending].filter((name) => documented.has(name) || !names.has(name)).sort();

  assert.deepEqual(missing, [], 'add a row to docs/naming.md for each of these names');
  assert.deepEqual(settled, [], 'take these names off pendingPhase4Renames');
});

/**
 * The names docs/naming.md retires: each first-column name of a public row
 * that is not kept, unless the rename still uses it (a second column, a kept
 * row, or an `aria-*` pattern). Internals are left out: they keep their names
 * until their own rename.
 */
function retiredNames(): string[] {
  const table = readFileSync(resolve(root, 'docs/naming.md'), 'utf8');
  const retired = new Set<string>();
  const used = new Set<string>();
  const patterns: string[] = [];

  for (const line of table.slice(0, table.indexOf('\n## Internals')).split('\n')) {
    const [, first = '', second = ''] = /^\|([^|]*)\|([^|]*)\|/.exec(line) ?? [];
    const kept = /^(keep|new|remove from)\b/.test(second.trim());

    for (const [, name = ''] of first.matchAll(/`([^`]+)`/g)) (kept ? used : retired).add(name);

    for (const [, name = ''] of second.matchAll(/`([^`]+)`/g)) {
      if (name.endsWith('*')) patterns.push(name.slice(0, -1));
      else used.add(name.replace(/\(.*\)$/, ''));
    }
  }

  return [...retired].filter(
    (name) => !used.has(name) && !patterns.some((prefix) => name.startsWith(prefix)),
  );
}

/**
 * Retired names the code still has in another role: docs may name them, but
 * not in the form the retired name took, a JSX attribute or a call.
 */
const otherRoles = new Map<string, { form: 'attribute' | 'call'; role: string }>([
  ['state', { form: 'call', role: '`app.state`, `network.state`, a devtools kind' }],
  ['text', { form: 'attribute', role: "an alert button's label, a text event's payload" }],
  ['source', { form: 'attribute', role: 'the signal `watch` and `follows` read' }],
  ['exiting', { form: 'attribute', role: "a renderer record's state as its view leaves" }],
  ['enabled', { form: 'attribute', role: 'an RNGH config key on the wire (docs/motion.md)' }],
  ['hitSlop', { form: 'attribute', role: 'an RNGH config key on the wire (docs/motion.md)' }],
  [
    'handlerTag',
    { form: 'attribute', role: "an RNGH gesture event's key on the wire (docs/motion.md)" },
  ],
]);

/** Native module names (`defineModule('Clipboard', …)`), which stay capitalized. */
function moduleNames(): Set<string> {
  const names = new Set<string>();
  const modules = resolve(root, 'native/modules');

  for (const module of readdirSync(modules)) {
    const spec = resolve(modules, module, `${module}.ts`);

    if (!existsSync(spec)) continue;

    for (const [, name] of readFileSync(spec, 'utf8').matchAll(/defineModule\('(\w+)'/g))
      if (name) names.add(name);
  }

  return names;
}

/** The code a doc shows: its fenced blocks' lines and its inline code spans, by line. */
function* codeOf(text: string): Generator<[line: number, code: string]> {
  let fenced = false;

  for (const [index, line] of text.split('\n').entries()) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (fenced) yield [index + 1, line];
    else for (const [, span = ''] of line.matchAll(/`([^`]+)`/g)) yield [index + 1, span];
  }
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternatives = (names: string[]) => `(${names.map(escape).join('|')})`;
const forms = {
  anywhere: (names: string[]) => `(?<![\\w$.'"/-])${alternatives(names)}(?![\\w$-])`,
  attribute: (names: string[]) =>
    `(?:(?<=<[A-Z][\\w.]*\\s[^>]*)|(?<![\\w$.'"/-])(?=\\w+\\s*=[^=>]))${alternatives(names)}(?![\\w$-])`,
  call: (names: string[]) => `(?<![\\w$.'"/-])${alternatives(names)}(?=\\s*[(<])`,
};

test('docs use the names docs/naming.md gives, not the ones it retires', () => {
  const current = new Set([...packageNames(), ...Object.keys(PROPS), ...moduleNames()]);
  // A name with another role is checked in its retired form even while that role keeps it public.
  const retired = retiredNames().filter((name) => otherRoles.has(name) || !current.has(name));
  const inForm = (form: 'attribute' | 'call') =>
    retired.filter((name) => otherRoles.get(name)?.form === form);
  const byForm = [
    [forms.anywhere, retired.filter((name) => !otherRoles.has(name))],
    [forms.attribute, inForm('attribute')],
    [forms.call, inForm('call')],
  ] as const;
  // A form with no names would match the empty string everywhere.
  const pattern = new RegExp(
    byForm.flatMap(([form, names]) => (names.length ? [form(names)] : [])).join('|'),
    'g',
  );
  const docs = resolve(root, 'docs');
  const hits: string[] = [];

  for (const file of readdirSync(docs)) {
    if (!file.endsWith('.md') || file === 'history.md' || file === 'naming.md') continue;

    for (const [line, code] of codeOf(readFileSync(resolve(docs, file), 'utf8')))
      for (const match of code.matchAll(pattern))
        hits.push(`docs/${file}:${line}: ${match.slice(1).find(Boolean)}`);
  }

  assert.deepEqual(hits, [], 'use the name docs/naming.md gives each of these');
});

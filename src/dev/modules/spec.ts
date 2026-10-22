/**
 * Reads a native module's spec (docs/native-modules.md) without running it:
 * `export default defineModule('Battery', { level: fn.sync<() => number>(), … })`
 * and the type aliases its functions name, as plain data every generator
 * shares. Anything that is not a static declaration fails at its line.
 */
import { child, children, nameOf, type AstNode } from '../ast.ts';
import { parseModule } from '../parse.ts';

export type Thread = 'js' | 'main' | 'background';

/** A value the platforms share: what crosses the host boundary and what Swift and Kotlin declare. */
export type SpecType =
  | { kind: 'number' | 'string' | 'boolean' | 'json' | 'bytes' }
  | { kind: 'nullable'; of: SpecType }
  | { kind: 'array'; of: SpecType }
  | { kind: 'record'; of: SpecType }
  | { kind: 'enum'; name: string }
  | { kind: 'object'; name: string };

export interface Field {
  name: string;
  type: SpecType;
  /** Declared with `?`, or as `| undefined`: absent rather than null. */
  optional: boolean;
}

export type NamedType =
  | { kind: 'enum'; name: string; values: string[] }
  | { kind: 'object'; name: string; fields: Field[] };

export interface FunctionMember {
  kind: 'function';
  name: string;
  thread: Thread;
  /** Settles a promise from a callback rather than returning its result. */
  callback: boolean;
  params: Field[];
  /** null: nothing, for `void`. */
  result: SpecType | null;
  line: number;
}

/** Sent by the platform while JavaScript listens: `event<Payload>()`. */
export interface EventMember {
  kind: 'event';
  name: string;
  /** null: an event without a payload. */
  payload: SpecType | null;
  line: number;
}

/**
 * Platform state JavaScript reads as a signal: `live<T>()`. Read on the JS
 * thread while unwatched; while watched, the platform sends each change.
 */
export interface LiveMember {
  kind: 'live';
  name: string;
  type: SpecType;
  line: number;
}

/**
 * A view the module contributes: `view<Props, Methods>({ events, methods,
 * children })`. Its props are set by name natively, its events reach the
 * element, its methods run on the main thread with the view, and it lays out
 * children inside it only when it declares `children: true`.
 */
export interface ViewMember {
  kind: 'view';
  name: string;
  events: string[];
  methods: FunctionMember[];
  children: boolean;
  line: number;
}

/**
 * Platform state the UI thread follows: `motion<T>()`. The platform writes
 * each change into the UI runtime on the main thread, and sends it to
 * JavaScript too; null until the first.
 */
export interface MotionMember {
  kind: 'motion';
  name: string;
  /** Nullable: what the app reads before the platform has set it. */
  type: SpecType;
  line: number;
}

export type Member = FunctionMember | EventMember | LiveMember | MotionMember | ViewMember;

export interface ModuleSpec {
  name: string;
  file: string;
  members: Member[];
  /** The enums and records the members name, in declaration order. */
  types: NamedType[];
  /** `ios` and `android` as written: plain data the CLI validates. */
  needs: Record<string, unknown>;
  /** Specifiers of the spec's imports but Kuito's: a module it imports is one it requires. */
  imports: string[];
}

export const MODULE_NAME = /^[A-Z][A-Za-z0-9]*$/;

/** What a view's element answers itself (src/runtime/elements.ts); its methods join them. */
const ELEMENT_MEMBERS = new Set([
  'id',
  'parent',
  'children',
  'setProperty',
  'focus',
  'blur',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'clear',
  'then',
]);

/** The keys of a spec that are native needs rather than members. */
export const NEED_KEYS = ['ios', 'android'] as const;

/** Names a member cannot take: the namespace's own, and what makes it thenable. */
const RESERVED = new Set<string>(['then', 'default', ...NEED_KEYS]);

/** A Swift and Kotlin identifier, which every member and field becomes. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const THREADS: Record<string, Thread> = { sync: 'js', main: 'main', background: 'background' };

const THREAD_NAMES: Record<Thread, string> = {
  js: 'the JS thread',
  main: 'the main thread',
  background: 'its background thread',
};

/** Statements a spec may hold: none of them runs. */
const DECLARATIONS = new Set([
  'ImportDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
]);

const KEYWORDS: Record<string, SpecType> = {
  TSNumberKeyword: { kind: 'number' },
  TSStringKeyword: { kind: 'string' },
  TSBooleanKeyword: { kind: 'boolean' },
};

const isNothing = (node: AstNode) =>
  node.type === 'TSVoidKeyword' || node.type === 'TSUndefinedKeyword';

interface Declared {
  node: AstNode;
  name: string;
}

export function readModuleSpec(file: string, source: string): ModuleSpec {
  const { root, errors, locate } = parseModule(file, source);
  const fail = (message: string, node?: AstNode): never => {
    throw new Error(
      node ? `${file}:${locate(node.start).line}: ${message}` : `${file}: ${message}`,
    );
  };

  if (errors.length) fail(errors[0].message);

  const declared = new Map<string, Declared>();
  const imports: string[] = [];
  let definition: AstNode | undefined;

  for (const statement of children(root, 'body')) {
    const exported = statement.type === 'ExportNamedDeclaration';
    const inner = exported ? child(statement, 'declaration') : statement;

    if (statement.type === 'ExportDefaultDeclaration') {
      definition = child(statement, 'declaration');
      continue;
    }

    // `export type { A } from './a'`: a type, re-exported.
    if (exported && !inner && statement.exportKind === 'type') continue;

    if (!inner || !DECLARATIONS.has(inner.type) || (exported && inner.type === 'ImportDeclaration'))
      fail(
        'a module spec holds imports, types and its defineModule; this statement would run',
        statement,
      );

    if (inner?.type === 'ImportDeclaration') {
      const from = child(inner, 'source')?.value;

      // Kuito's own entry is not a module; another package's spec is, by its name.
      if (typeof from === 'string' && from !== 'kuito' && !from.startsWith('kuito/'))
        imports.push(from);

      continue;
    }

    const name = nameOf(child(inner as AstNode, 'id'));

    if (inner && name) declared.set(name, { node: inner, name });
  }

  if (
    definition?.type !== 'CallExpression' ||
    nameOf(child(definition, 'callee')) !== 'defineModule'
  )
    return fail(
      "a module spec's default export is its definition: export default defineModule('Battery', { … })",
    );

  const [nameNode, membersNode] = children(definition, 'arguments');
  const name = nameNode?.type === 'Literal' ? nameNode.value : undefined;

  if (typeof name !== 'string')
    fail("defineModule needs the module's name as a string literal", definition);

  if (!MODULE_NAME.test(String(name)))
    fail(`the module's name must be PascalCase, like Battery: '${String(name)}'`, nameNode);

  if (membersNode?.type !== 'ObjectExpression')
    fail("defineModule's second argument is the module's members, an object literal", definition);

  const types = typeReader(declared, fail);
  const members: Member[] = [];
  const needs: Record<string, unknown> = {};

  for (const property of children(membersNode as AstNode, 'properties')) {
    if (property.type !== 'Property' || property.computed)
      fail("a module's members are written out: no spread or computed keys", property);

    const key = propertyName(property);
    const value = child(property, 'value');

    if (key === null || !value)
      return fail("a module's members are named by identifiers", property);

    if (NEED_KEYS.some((need) => need === key)) {
      needs[key] = literal(value, key, fail);
      continue;
    }

    if (RESERVED.has(key)) fail(`${key} is reserved; name the function otherwise`, property);
    if (!IDENTIFIER.test(key)) fail(`${key} must be a Swift and Kotlin identifier`, property);
    if (members.some((member) => member.name === key)) fail(`${key} is declared twice`, property);

    members.push(member(key, value, types, fail, locate(property.start).line));
  }

  return { name: String(name), file, members, types: types.named(), needs, imports };
}

type Fail = (message: string, node?: AstNode) => never;

function propertyName(property: AstNode): string | null {
  const key = child(property, 'key');

  if (!key) return null;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;

  return nameOf(key) ?? null;
}

/** `fn.main.callback` as its parts: `['fn', 'main', 'callback']`. */
function calleePath(callee: AstNode | undefined): string[] {
  if (!callee) return [];
  if (callee.type === 'Identifier') return [String(callee.name)];
  if (callee.type !== 'MemberExpression' || callee.computed) return [];

  const property = nameOf(child(callee, 'property'));

  return property ? [...calleePath(child(callee, 'object')), property] : [];
}

function member(name: string, value: AstNode, types: TypeReader, fail: Fail, line: number): Member {
  const path = value.type === 'CallExpression' ? calleePath(child(value, 'callee')) : [];
  const [argument] = children(child(value, 'typeArguments') ?? value, 'params');

  if (path.length === 1 && path[0] === 'event')
    return {
      kind: 'event',
      name,
      payload:
        argument && !isNothing(argument) ? types.read(argument, `${name}'s payload`).type : null,
      line,
    };

  if (path.length === 1 && path[0] === 'view') return viewMember(name, value, types, fail, line);

  if (path.length === 1 && path[0] === 'motion') {
    if (!argument) return fail("motion needs the value's type: motion<number>()", value);

    const { type } = types.read(argument, name);

    return {
      kind: 'motion',
      name,
      type: type.kind === 'nullable' ? type : { kind: 'nullable', of: type },
      line,
    };
  }

  if (path.length === 1 && path[0] === 'live') {
    if (!argument) return fail("live needs the value's type: live<boolean>()", value);

    const read = types.read(argument, name);

    return {
      kind: 'live',
      name,
      type:
        read.undefinable && read.type.kind !== 'nullable'
          ? { kind: 'nullable', of: read.type }
          : read.type,
      line,
    };
  }

  const [root, threadName, mode] = path;
  const thread = threadName === undefined ? undefined : THREADS[threadName];
  const callback = mode === 'callback';

  if (
    root !== 'fn' ||
    !thread ||
    path.length > 3 ||
    (mode !== undefined && (!callback || thread === 'js'))
  )
    return fail(
      `${name} must be fn.sync, fn.main or fn.background, called with the function's type, or event, live or motion`,
      value,
    );

  const [signature] = children(child(value, 'typeArguments') ?? value, 'params');
  const declaration = path.join('.');

  if (signature?.type !== 'TSFunctionType')
    return fail(`${declaration} needs the function's type: ${declaration}<() => number>()`, value);

  const params = children(signature, 'params').map((param) => {
    const label = `${name}'s ${nameOf(param) ?? 'parameter'}`;
    const annotation = child(child(param, 'typeAnnotation') ?? param, 'typeAnnotation');

    if (param.type !== 'Identifier' || !annotation)
      return fail(`${label}: each parameter is a name with a type`, param);

    const read = types.read(annotation, label);

    return {
      name: String(param.name),
      type: read.type,
      optional: param.optional === true || read.undefinable,
    };
  });

  return {
    kind: 'function',
    name,
    thread,
    callback,
    params,
    result: result(name, thread, signature, types, fail),
    line,
  };
}

function viewMember(
  name: string,
  value: AstNode,
  types: TypeReader,
  fail: Fail,
  line: number,
): ViewMember {
  const [options] = children(value, 'arguments');
  const view: ViewMember = { kind: 'view', name, events: [], methods: [], children: false, line };

  if (!options) return view;

  if (options.type !== 'ObjectExpression')
    return fail(`${name}: view takes { events, methods }, an object literal`, options);

  for (const property of children(options, 'properties')) {
    const key = property.type === 'Property' && !property.computed ? propertyName(property) : null;
    const entry = child(property, 'value');

    if (key === 'events' && entry?.type === 'ArrayExpression') {
      view.events = children(entry, 'elements').map((element) =>
        element.type === 'Literal' && typeof element.value === 'string'
          ? element.value
          : fail(`${name}.events lists the events' names as string literals`, element),
      );
    } else if (key === 'methods' && entry?.type === 'ObjectExpression') {
      view.methods = children(entry, 'properties').map((method) => {
        const methodName = method.type === 'Property' ? propertyName(method) : null;
        const body = child(method, 'value');

        if (!methodName || !body) return fail(`${name}.methods are written out`, method);

        if (ELEMENT_MEMBERS.has(methodName))
          return fail(
            `${name}.${methodName} is a member of the view's element; name the method otherwise`,
            method,
          );

        const declared = member(`${name}.${methodName}`, body, types, fail, line);

        if (declared.kind !== 'function' || declared.thread !== 'main')
          return fail(`${name}.${methodName} runs on the main thread with the view: fn.main`, body);

        return { ...declared, name: methodName };
      });
    } else if (key === 'children') {
      view.children =
        entry?.type === 'Literal' && typeof entry.value === 'boolean'
          ? entry.value
          : fail(`${name}.children is true or false`, property);
    } else {
      fail(
        `${name}: view takes events, a list of names, methods, an object, and children, a boolean`,
        property,
      );
    }
  }

  return view;
}

function result(
  name: string,
  thread: Thread,
  signature: AstNode,
  types: TypeReader,
  fail: Fail,
): SpecType | null {
  const annotation = child(child(signature, 'returnType') ?? signature, 'typeAnnotation');

  if (!annotation) return fail(`${name} needs its result type`, signature);

  const promised =
    annotation.type === 'TSTypeReference' && nameOf(child(annotation, 'typeName')) === 'Promise'
      ? children(child(annotation, 'typeArguments') ?? annotation, 'params')[0]
      : undefined;

  if (thread === 'js' && promised)
    fail(
      `${name} runs on the JS thread and returns its value: declare it fn.main or fn.background to return a Promise`,
      annotation,
    );

  if (thread !== 'js' && !promised)
    fail(`${name} runs on ${THREAD_NAMES[thread]}, so it returns a Promise`, annotation);

  const resolved = promised ?? annotation;

  if (isNothing(resolved)) return null;

  const read = types.read(resolved, `${name}'s result`);

  return read.undefinable && read.type.kind !== 'nullable'
    ? { kind: 'nullable', of: read.type }
    : read.type;
}

/** A literal as plain data; anything else is not static. */
function literal(node: AstNode, path: string, fail: Fail): unknown {
  switch (node.type) {
    case 'Literal':
      if (node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value))
        return node.value;

      break;
    case 'TemplateLiteral': {
      const [quasi] = children(node, 'quasis');
      const cooked = quasi && Reflect.get(Object(quasi.value), 'cooked');

      if (!children(node, 'expressions').length && typeof cooked === 'string') return cooked;
      break;
    }
    case 'UnaryExpression': {
      const argument = child(node, 'argument');

      if (
        node.operator === '-' &&
        argument?.type === 'Literal' &&
        typeof argument.value === 'number'
      )
        return -argument.value;

      break;
    }
    case 'ArrayExpression':
      return children(node, 'elements').map((each, index) =>
        literal(each, `${path}[${index}]`, fail),
      );
    case 'ObjectExpression':
      return Object.fromEntries(
        children(node, 'properties').map((property) => {
          const key =
            property.type === 'Property' && !property.computed ? propertyName(property) : null;
          const value = child(property, 'value');

          if (key === null || !value)
            return fail(`${path} must be a literal: no spread or computed keys`, property);

          return [key, literal(value, `${path}.${key}`, fail)];
        }),
      );
  }

  return fail(`${path} must be a literal: strings, numbers, booleans, arrays and objects`, node);
}

interface Read {
  type: SpecType;
  /** The union includes undefined: an absent value. */
  undefinable: boolean;
}

type TypeReader = ReturnType<typeof typeReader>;

/** Reads type annotations against the spec's own aliases and interfaces. */
function typeReader(declared: ReadonlyMap<string, Declared>, fail: Fail) {
  const named = new Map<string, { type: NamedType; start: number }>();
  const resolving = new Set<string>();

  function reference(node: AstNode, where: string): Read {
    const name = nameOf(child(node, 'typeName'));
    const args = children(child(node, 'typeArguments') ?? node, 'params');
    const local = name === undefined ? undefined : declared.get(name);

    if (local) return { type: alias(local, where, node), undefinable: false };

    if ((name === 'Array' || name === 'ReadonlyArray') && args.length === 1)
      return { type: { kind: 'array', of: read(args[0], where).type }, undefinable: false };

    if (name === 'Record' && args.length === 2) {
      if (args[0].type !== 'TSStringKeyword') fail(`${where}: a Record's keys are strings`, node);

      return { type: { kind: 'record', of: read(args[1], where).type }, undefinable: false };
    }

    if (name === 'Json' && args.length === 0) return { type: { kind: 'json' }, undefinable: false };

    if (name === 'ArrayBuffer' && args.length === 0)
      return { type: { kind: 'bytes' }, undefinable: false };

    return fail(`${where}: ${name ?? 'this type'} is not a type the platforms share`, node);
  }

  /** A declared name: an enum, a record, or the type it aliases. */
  function alias({ node, name }: Declared, where: string, at: AstNode): SpecType {
    const existing = named.get(name);

    if (existing) return { kind: existing.type.kind, name };

    if (child(node, 'typeParameters'))
      fail(`${name}: a generic type is not one the platforms share`, node);

    if (node.type === 'TSInterfaceDeclaration') {
      if (children(node, 'extends').length)
        fail(`${name}: write out its fields instead of extends`, node);

      return record(name, node, children(child(node, 'body') ?? node, 'body'));
    }

    const aliased = child(node, 'typeAnnotation');

    if (!aliased) return fail(`${where}: ${name} has no type`, at);

    const values = stringUnion(aliased);

    if (values) {
      named.set(name, { type: { kind: 'enum', name, values }, start: node.start });

      return { kind: 'enum', name };
    }

    if (aliased.type === 'TSTypeLiteral') return record(name, node, children(aliased, 'members'));

    if (resolving.has(name)) fail(`${name} refers to itself`, node);

    resolving.add(name);

    const type = read(aliased, where).type;

    resolving.delete(name);

    return type;
  }

  function record(name: string, node: AstNode, members: AstNode[]): SpecType {
    const type: NamedType = { kind: 'object', name, fields: [] };

    // Registered before its fields, so one that refers to itself resolves.
    named.set(name, { type, start: node.start });

    for (const field of members) {
      const key =
        field.type === 'TSPropertySignature' && !field.computed ? propertyName(field) : null;
      const label = `${name}.${key ?? 'field'}`;
      const annotation = child(child(field, 'typeAnnotation') ?? field, 'typeAnnotation');

      if (field.type === 'TSMethodSignature')
        fail(
          `${name}.${propertyName(field) ?? 'method'}: a function is not a type the platforms share`,
          field,
        );

      if (key === null || !annotation)
        return fail(`${label}: each field is a name with a type`, field);

      if (!IDENTIFIER.test(key)) fail(`${label} must be a Swift and Kotlin identifier`, field);

      const value = read(annotation, label);

      type.fields.push({
        name: key,
        type: value.type,
        optional: field.optional === true || value.undefinable,
      });
    }

    return { kind: 'object', name };
  }

  function union(node: AstNode, where: string): Read {
    const members = children(node, 'types');
    const nullable = members.some((each) => each.type === 'TSNullKeyword');
    const undefinable = members.some((each) => each.type === 'TSUndefinedKeyword');
    const rest = members.filter((each) => each.type !== 'TSNullKeyword' && !isNothing(each));

    if (rest.length !== 1) {
      const values = stringUnion({ ...node, types: rest });

      if (values)
        fail(
          `${where}: name this union with a type alias (type ${aliasName(where)} = ${values
            .map((value) => `'${value}'`)
            .join(' | ')})`,
          node,
        );

      return fail(`${where}: a union is a string enum or adds null to one type`, node);
    }

    const type = read(rest[0], where).type;

    return { type: nullable ? { kind: 'nullable', of: type } : type, undefinable };
  }

  function read(node: AstNode, where: string): Read {
    const keyword = KEYWORDS[node.type];

    if (keyword) return { type: keyword, undefinable: false };

    switch (node.type) {
      case 'TSParenthesizedType':
        return read(child(node, 'typeAnnotation') ?? node, where);
      case 'TSTypeOperator':
        if (node.operator === 'readonly') return read(child(node, 'typeAnnotation') ?? node, where);
        break;
      case 'TSArrayType':
        return {
          type: { kind: 'array', of: read(child(node, 'elementType') ?? node, where).type },
          undefinable: false,
        };
      case 'TSTypeReference':
        return reference(node, where);
      case 'TSUnionType':
        return union(node, where);
      case 'TSLiteralType': {
        const [value] = stringUnion(node) ?? [];

        if (value !== undefined)
          fail(
            `${where}: name this union with a type alias (type ${aliasName(where)} = '${value}')`,
            node,
          );

        break;
      }
      case 'TSTypeLiteral':
        return fail(
          `${where}: name this object type with a type alias (type ${aliasName(where)} = { … })`,
          node,
        );
      case 'TSFunctionType':
        return fail(`${where}: a function is not a type the platforms share`, node);
    }

    return fail(`${where}: this type is not one the platforms share`, node);
  }

  return {
    read,
    named: () => [...named.values()].sort((a, b) => a.start - b.start).map(({ type }) => type),
  };
}

/** A union of string literals' values, or null. */
function stringUnion(node: AstNode): string[] | null {
  const members = node.type === 'TSUnionType' ? children(node, 'types') : [node];
  const values = members.map((each) => {
    const value = each.type === 'TSLiteralType' ? child(each, 'literal')?.value : undefined;

    return typeof value === 'string' ? value : null;
  });

  return values.length && values.every((value) => value !== null) ? (values as string[]) : null;
}

/** A name to suggest for an alias of `where`'s type: `set's mode` → Mode. */
function aliasName(where: string) {
  const last =
    where
      .split(/['. ]+/)
      .filter(Boolean)
      .at(-1) ?? 'Value';

  return last === 'result' ? 'Result' : last.charAt(0).toUpperCase() + last.slice(1);
}

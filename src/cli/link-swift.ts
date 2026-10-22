/**
 * The iOS shell's side of the module specs (docs/native-modules.md): for
 * each included module a `<Name>Spec` protocol its Swift class conforms to,
 * the spec's enums and structs, and `KuitoLink.function(id)`, the link table
 * of the functions the bundle calls. A function nothing calls has no entry,
 * so the linker strips it, and a class that drifted from its spec fails to
 * compile, naming the method.
 */
import type { CatalogModule, ModuleCatalog } from '../dev/modules/catalog.ts';
import type {
  Field,
  FunctionMember,
  Member,
  NamedType,
  SpecType,
  ViewMember,
} from '../dev/modules/spec.ts';
import {
  accessorName,
  calledMembers,
  capitalized,
  declaredTypes,
  GENERATED,
  launches,
  liveRead,
  words,
} from './link-types.ts';
import { linkSignatures } from './link-signature.ts';

type Signatures = ReturnType<typeof linkSignatures>;

const KEYWORDS = new Set(
  (
    'associatedtype class deinit enum extension fileprivate func import init inout internal let open ' +
    'operator private protocol public rethrows static struct subscript typealias var break case ' +
    'continue default defer do else fallthrough for guard if in repeat return switch where while as ' +
    'Any catch false is nil super self Self throw throws true try'
  ).split(' '),
);

const identifier = (name: string) => (KEYWORDS.has(name) ? `\`${name}\`` : name);

function typeName(type: SpecType): string {
  switch (type.kind) {
    case 'number':
      return 'Double';
    case 'string':
      return 'String';
    case 'boolean':
      return 'Bool';
    case 'json':
      return 'Any';
    case 'bytes':
      return 'Data';
    case 'nullable':
      return typeName(type.of) + '?';
    case 'array':
      return `[${typeName(type.of)}]`;
    case 'record':
      return `[String: ${typeName(type.of)}]`;
    case 'enum':
    case 'object':
      return type.name;
  }
}

const fieldType = ({ type, optional }: Field) =>
  optional && type.kind !== 'nullable' ? typeName(type) + '?' : typeName(type);

/** An expression decoding `value` (a `KuitoArgument`) as `type`. */
function decode(type: SpecType, value: string): string {
  switch (type.kind) {
    case 'number':
      return `${value}.number()`;
    case 'string':
      return `${value}.string()`;
    case 'boolean':
      return `${value}.bool()`;
    case 'json':
      return `${value}.json()`;
    case 'bytes':
      return `${value}.bytes()`;
    case 'nullable':
      return `${value}.optional { try ${decode(type.of, '$0')} }`;
    case 'array':
      return `${value}.array { try ${decode(type.of, '$0')} }`;
    case 'record':
      return `${value}.record { try ${decode(type.of, '$0')} }`;
    case 'enum':
      return `${value}.enumeration(${type.name}.self)`;
    case 'object':
      return `${value}.decode(${type.name}.self)`;
  }
}

const decodeField = (field: Field, value: string) =>
  field.optional && field.type.kind !== 'nullable'
    ? decode({ kind: 'nullable', of: field.type }, value)
    : decode(field.type, value);

/**
 * An expression encoding `value` of `type` as Foundation data: a struct as
 * its fields in declared order to cross (`fields`), or as JSON data.
 */
function encode(type: SpecType, value: string, form: 'fields' | 'json' = 'fields'): string {
  switch (type.kind) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'json':
    case 'bytes':
      return value;
    case 'nullable':
      return `(${value}.map { ${encode(type.of, '$0', form)} as Any } ?? NSNull())`;
    case 'array':
    case 'record': {
      const each = encode(type.of, '$0', form);

      if (each === '$0') return value;

      return `${value}.${type.kind === 'array' ? 'map' : 'mapValues'} { ${each} as Any }`;
    }
    case 'enum':
      return `${value}.rawValue`;
    case 'object':
      return form === 'fields' ? `${value}.kuitoFields()` : `${value}.kuitoEncoded()`;
  }
}

/** `low-power` → `lowPower`; a case can't start with a digit. */
function caseName(value: string) {
  const [first = 'value', ...rest] = words(value);
  const name =
    first.charAt(0).toLowerCase() +
    first.slice(1) +
    rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');

  return identifier(/^[0-9]/.test(name) ? '_' + name : name);
}

function declaration(type: NamedType): string[] {
  if (type.kind === 'enum')
    return [
      `enum ${type.name}: String {`,
      ...type.values.map((value) => {
        const name = caseName(value);

        return name === value ? `    case ${name}` : `    case ${name} = ${JSON.stringify(value)}`;
      }),
      '}',
      '',
    ];

  const fields = type.fields;

  return [
    `struct ${type.name} {`,
    ...fields.map((field) => `    var ${identifier(field.name)}: ${fieldType(field)}`),
    '}',
    '',
    // Its fields cross in the order they are declared (src/cli/link-signature.ts).
    `extension ${type.name}: KuitoDecodable {`,
    `    static func kuitoDecode(_ value: KuitoArgument) throws -> ${type.name} {`,
    `        ${type.name}(`,
    ...fields.map(
      (field, index) =>
        `            ${identifier(field.name)}: try ${decodeField(field, `value.field(${index}, ${JSON.stringify(field.name)})`)}` +
        (index < fields.length - 1 ? ',' : ''),
    ),
    '        )',
    '    }',
    '}',
    '',
    `extension ${type.name}: KuitoEncodable {`,
    '    func kuitoEncoded() -> Any {',
    '        var fields: [String: Any] = [:]',
    ...fields.map((field) => {
      const key = JSON.stringify(field.name);
      const name = identifier(field.name);

      // An absent optional field stays absent; a nullable one is null.
      return field.optional && field.type.kind !== 'nullable'
        ? `        if let value = ${name} { fields[${key}] = ${encode(field.type, 'value', 'json')} }`
        : `        fields[${key}] = ${encode(field.type, name, 'json')}`;
    }),
    '        return fields',
    '    }',
    '',
    '    func kuitoFields() -> [Any] {',
    '        [',
    ...fields.map((field) => {
      const name = identifier(field.name);

      // An absent optional field crosses as null, and stays absent in JavaScript.
      return field.optional && field.type.kind !== 'nullable'
        ? `            ${name}.map { ${encode(field.type, '$0')} as Any } ?? NSNull(),`
        : `            ${encode(field.type, name)},`;
    }),
    '        ]',
    '    }',
    '}',
    '',
  ];
}

function functionRequirement(member: FunctionMember, view = false): string {
  const actor = member.thread === 'main' ? '@MainActor ' : '';
  const params = [
    // A view's method gets the mounted view it was called on.
    ...(view ? ['_ view: UIView'] : []),
    ...member.params.map((param) => `_ ${identifier(param.name)}: ${fieldType(param)}`),
  ];

  if (member.callback)
    return `${actor}func ${identifier(member.name)}(${[
      ...params,
      `_ promise: KuitoPromise<${member.result ? typeName(member.result) : 'Void'}>`,
    ].join(', ')})`;

  const result = member.result ? ` -> ${typeName(member.result)}` : '';

  return `${actor}func ${identifier(member.name)}(${params.join(', ')}) throws${result}`;
}

/** An event or a live value starts and stops on the main thread; a live value is also read. */
function requirements(member: Member): string[] {
  if (member.kind === 'function') return [functionRequirement(member)];

  if (member.kind === 'view')
    return [
      `func ${identifier(member.name)}() -> KuitoModuleView`,
      ...member.methods.map((method) => functionRequirement(method, true)),
    ];

  const name = capitalized(member.name);
  const start =
    member.kind === 'event'
      ? `_ emitter: KuitoEmitter<${member.payload ? typeName(member.payload) : 'Void'}>`
      : `_ ${member.kind === 'live' ? 'signal' : 'motion'}: ${SENDERS[member.kind]}<${typeName(member.type)}>`;

  return [
    ...(member.kind === 'live' ? [functionRequirement(liveRead(member))] : []),
    `@MainActor func start${name}(${start})`,
    `@MainActor func stop${name}()`,
  ];
}

function protocol({ spec }: CatalogModule): string[] {
  return [
    `/// ${spec.name}'s functions, as ${spec.file} declares them.`,
    `protocol ${spec.name}Spec: KuitoLinkedModule {`,
    ...spec.members.flatMap(requirements).map((line) => `    ${line}`),
    '}',
    '',
  ];
}

function entry(
  signatures: Signatures,
  id: number,
  module: string,
  member: FunctionMember,
  view = false,
): string[] {
  // A view's method: the view's number comes first, the view itself is found on the main thread.
  const offset = view ? 1 : 0;
  const decoded = [
    ...(view ? ['let view = try args[0].number()'] : []),
    ...member.params.map(
      (param, index) => `let a${index} = try ${decodeField(param, `args[${index + offset}]`)}`,
    ),
  ];
  const args = [
    ...(view ? ['try KuitoModuleViews.shared.linked(view)'] : []),
    ...member.params.map((_, index) => `a${index}`),
  ];
  const callee = `module.${identifier(member.name)}`;
  // A main-thread function's requirement is @MainActor; the linker calls it on the main thread.
  const isolated = (call: string, throwing = true) => {
    const tried = throwing ? `try ${call}` : call;

    if (member.thread !== 'main') return tried;

    // Finding a view's mounted view throws too.
    return `${throwing || view ? 'try ' : ''}MainActor.assumeIsolated { ${tried} }`;
  };
  const result = member.result ? typeName(member.result) : 'Void';
  const name = JSON.stringify(`${module}.${member.name}`);
  const body = member.callback
    ? [
        `let promise = KuitoPromise<${result}>(reply) { ${member.result ? encode(member.result, '$0') : 'NSNull()'} }`,
        isolated(`${callee}(${[...args, 'promise'].join(', ')})`, false),
      ]
    : member.result
      ? [
          `let result = ${isolated(`${callee}(${args.join(', ')})`)}`,
          `reply.resolve(${encode(member.result, 'result')})`,
        ]
      : [isolated(`${callee}(${args.join(', ')})`), 'reply.resolve(NSNull())'];

  return [
    `        case ${id}: return KuitoFunction(${name}, thread: .${member.thread}, arity: ${member.params.length + offset}, signature: ${JSON.stringify(signatures.function(member.params, member.result, view ? ['n'] : []))}) { link, args, reply in`,
    `            let module = link.${accessorName(module)}()`,
    ...[...decoded, ...body].map((line) => '            ' + line),
    '        }',
  ];
}

/** A view's own id registers its kind with the renderer, on the JS thread, as the kernel plans it. */
function viewEntry(id: number, module: string, member: ViewMember): string[] {
  return [
    `        case ${id}: return KuitoFunction(${JSON.stringify(`${module}.${member.name}`)}, thread: .js, arity: 0, signature: "()_") { link, _, reply in`,
    `            let module = link.${accessorName(module)}()`,
    `            KuitoModuleViews.shared.register(${JSON.stringify(`module:${module}`)}, module.${identifier(member.name)}().kind(events: ${JSON.stringify(member.events)}))`,
    '            reply.resolve(NSNull())',
    '        }',
  ];
}

/** What a module's `start<Name>` is given for each kind of observed member. */
const SENDERS = { event: 'KuitoEmitter', live: 'KuitoSignal', motion: 'KuitoMotion' } as const;

function observer(signatures: Signatures, id: number, module: string, member: Member): string[] {
  if (member.kind === 'function' || member.kind === 'view') return [];

  const name = capitalized(member.name);
  const type = member.kind === 'event' ? member.payload : member.type;
  const sender = SENDERS[member.kind];
  const encoded = type ? encode(type, '$0') : 'NSNull()';
  const accessor = `let module = link.${accessorName(module)}()`;
  const motion = member.kind === 'motion' ? ', motion: true' : '';
  const signature = JSON.stringify(signatures.observed(type));

  return [
    `        case ${id}: return KuitoObserver(${JSON.stringify(`${module}.${member.name}`)}, signature: ${signature}${motion}) { link, emit in`,
    `            ${accessor}`,
    `            let sender = ${sender}<${type ? typeName(type) : 'Void'}>(emit) { ${type ? encoded : '_ in NSNull()'} }`,
    `            MainActor.assumeIsolated { module.start${name}(sender) }`,
    '        } stop: { link in',
    `            ${accessor}`,
    `            MainActor.assumeIsolated { module.stop${name}() }`,
    '        }',
  ];
}

function swiftClass(module: CatalogModule): string {
  const needs = module.spec.needs.ios;
  const name =
    typeof needs === 'object' && needs !== null ? Reflect.get(needs, 'class') : undefined;

  if (typeof name !== 'string')
    throw new Error(`${module.spec.file}: ios.class names the Swift class`);

  return name;
}

/**
 * KuitoLink.swift: the protocols and types of `modules` (the shell's iOS
 * modules with a spec) and the entries of the `ids` the bundle calls.
 */
export function swiftLink(
  catalog: ModuleCatalog,
  modules: readonly CatalogModule[],
  ids: readonly number[],
): string {
  const types = declaredTypes(modules);
  const called = calledMembers(catalog, modules, ids);
  const accessors = modules.filter(({ spec }) => called.some(({ module }) => module === spec));
  const signatures = linkSignatures(types);

  return [
    GENERATED('each included module spec'),
    'import UIKit',
    '',
    ...types.flatMap(declaration),
    ...modules.flatMap(protocol),
    'extension KuitoLinkContext {',
    ...accessors.map(
      (module) =>
        `    fileprivate func ${accessorName(module.spec.name)}() -> some ${module.spec.name}Spec { ` +
        `module(${JSON.stringify(module.spec.name)}, ${swiftClass(module)}.self) }`,
    ),
    '}',
    '',
    '/// The members the bundle uses, by id; any other id is not linked into this shell.',
    'enum KuitoLink {',
    '    /// As the app finishes launching: the included modules that ask for it.',
    '    @MainActor static func launch() {',
    ...modules
      .filter((module) => launches(module, 'ios'))
      .map((module) => `        ${swiftClass(module)}.launch()`),
    '    }',
    '',
    '    static func function(_ id: Int32) -> KuitoFunction? {',
    '        switch id {',
    ...called.flatMap(({ id, module, member, view }) => {
      switch (member.kind) {
        case 'event':
        case 'motion':
          return [];
        case 'live':
          return entry(signatures, id, module.name, liveRead(member));
        case 'view':
          return viewEntry(id, module.name, member);
        case 'function':
          return entry(signatures, id, module.name, member, view !== undefined);
      }
    }),
    '        default: return nil',
    '        }',
    '    }',
    '',
    '    static func observer(_ id: Int32) -> KuitoObserver? {',
    '        switch id {',
    ...called.flatMap(({ id, module, member }) => observer(signatures, id, module.name, member)),
    '        default: return nil',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
}

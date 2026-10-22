/**
 * The Android shell's side of the module specs (docs/native-modules.md): for
 * each included module a `<Name>Spec` interface its Kotlin class implements,
 * the spec's enums and data classes, and `KuitoLink.function(id)`, the link
 * table of the functions the bundle calls. R8 removes what no entry reaches,
 * and a class that drifted from its spec fails to compile, naming the method.
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
    'as break class continue do else false for fun if in interface is null object package return ' +
    'super this throw true try typealias typeof val var when while'
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
      return 'Boolean';
    case 'json':
      return 'Any?';
    case 'bytes':
      return 'java.nio.ByteBuffer';
    case 'nullable':
      return type.of.kind === 'json' ? 'Any?' : typeName(type.of) + '?';
    case 'array':
      return `List<${typeName(type.of)}>`;
    case 'record':
      return `Map<String, ${typeName(type.of)}>`;
    case 'enum':
    case 'object':
      return type.name;
  }
}

const isOptional = ({ type, optional }: Field) => optional && type.kind !== 'nullable';

const fieldType = (field: Field) =>
  isOptional(field) && field.type.kind !== 'json'
    ? typeName(field.type) + '?'
    : typeName(field.type);

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
      return `${value}.optional { ${decode(type.of, 'it')} }`;
    case 'array':
      return `${value}.array { ${decode(type.of, 'it')} }`;
    case 'record':
      return `${value}.record { ${decode(type.of, 'it')} }`;
    case 'enum':
      return `${value}.enumeration(${type.name}.values())`;
    case 'object':
      return `${type.name}.kuitoDecode(${value})`;
  }
}

const decodeField = (field: Field, value: string) =>
  isOptional(field)
    ? decode({ kind: 'nullable', of: field.type }, value)
    : decode(field.type, value);

/**
 * An expression encoding `value` of `type` as plain data: a struct as its
 * fields in declared order to cross (`fields`), or as a map of JSON data.
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
    case 'array':
    case 'record': {
      const each = encode(type.of, 'it', form);

      if (each === 'it') return value;

      const map = { nullable: '?.let', array: '.map', record: '.mapValues' }[type.kind];

      return `${value}${map} { ${each} }`;
    }
    case 'enum':
      return `${value}.wire`;
    case 'object':
      return form === 'fields' ? `${value}.kuitoFields()` : `${value}.kuitoEncoded()`;
  }
}

/** `low-power` → `LOW_POWER`. */
function constantName(value: string) {
  const name = words(value).join('_').toUpperCase() || 'VALUE';

  return /^[0-9]/.test(name) ? '_' + name : name;
}

function declaration(type: NamedType): string[] {
  if (type.kind === 'enum')
    return [
      `enum class ${type.name}(override val wire: String) : KuitoEnum {`,
      ...type.values.map((value) => `    ${constantName(value)}(${JSON.stringify(value)}),`),
      '}',
      '',
    ];

  return [
    `data class ${type.name}(`,
    ...type.fields.map(
      (field) =>
        `    val ${identifier(field.name)}: ${fieldType(field)}${isOptional(field) ? ' = null' : ''},`,
    ),
    ') : KuitoEncodable {',
    '    override fun kuitoEncoded(): Map<String, Any?> = buildMap {',
    ...type.fields.map((field) => {
      const key = JSON.stringify(field.name);
      const name = identifier(field.name);

      // An absent optional field stays absent; a nullable one is null.
      return isOptional(field)
        ? `        ${name}?.let { put(${key}, ${encode(field.type, 'it', 'json')}) }`
        : `        put(${key}, ${encode(field.type, name, 'json')})`;
    }),
    '    }',
    '',
    // Its fields cross in the order they are declared, an absent one null (src/cli/link-signature.ts).
    '    override fun kuitoFields(): List<Any?> = listOf(',
    ...type.fields.map((field) => {
      const name = identifier(field.name);

      return isOptional(field)
        ? `        ${encode({ kind: 'nullable', of: field.type }, name)},`
        : `        ${encode(field.type, name)},`;
    }),
    '    )',
    '',
    '    companion object {',
    `        fun kuitoDecode(value: KuitoArgument) = ${type.name}(`,
    ...type.fields.map(
      (field, index) =>
        `            ${identifier(field.name)} = ${decodeField(field, `value.field(${index}, ${JSON.stringify(field.name)})`)},`,
    ),
    '        )',
    '    }',
    '}',
    '',
  ];
}

function functionRequirement(member: FunctionMember, view = false): string {
  const params = [
    // A view's method gets the mounted view it was called on.
    ...(view ? ['view: android.view.View'] : []),
    ...member.params.map((param) => `${identifier(param.name)}: ${fieldType(param)}`),
  ];

  if (member.callback)
    return `fun ${identifier(member.name)}(${[
      ...params,
      `promise: KuitoPromise<${member.result ? typeName(member.result) : 'Unit'}>`,
    ].join(', ')})`;

  return `fun ${identifier(member.name)}(${params.join(', ')})${member.result ? `: ${typeName(member.result)}` : ''}`;
}

/** An event or a live value starts and stops on the main thread; a live value is also read. */
function requirements(member: Member): string[] {
  if (member.kind === 'function') return [functionRequirement(member)];

  if (member.kind === 'view')
    return [
      `fun ${identifier(member.name)}(): KuitoModuleView<*>`,
      ...member.methods.map((method) => functionRequirement(method, true)),
    ];

  const name = capitalized(member.name);
  const start =
    member.kind === 'event'
      ? `emitter: KuitoEmitter<${member.payload ? typeName(member.payload) : 'Unit'}>`
      : `${member.kind === 'live' ? 'signal' : 'motion'}: ${SENDERS[member.kind]}<${typeName(member.type)}>`;

  return [
    ...(member.kind === 'live' ? [functionRequirement(liveRead(member))] : []),
    `fun start${name}(${start})`,
    `fun stop${name}()`,
  ];
}

function contract({ spec }: CatalogModule): string[] {
  return [
    `/** ${spec.name}'s functions, as ${spec.file} declares them. */`,
    `interface ${spec.name}Spec : KuitoLinkedModule {`,
    ...spec.members.flatMap(requirements).map((line) => `    ${line}`),
    '}',
    '',
  ];
}

function kotlinClass(module: CatalogModule): string {
  const needs = module.spec.needs.android;
  const name =
    typeof needs === 'object' && needs !== null ? Reflect.get(needs, 'class') : undefined;

  if (typeof name !== 'string')
    throw new Error(`${module.spec.file}: android.class names the Kotlin class`);

  return name;
}

const THREADS = { js: 'JS', main: 'MAIN', background: 'BACKGROUND' } as const;

function entry(
  signatures: Signatures,
  module: CatalogModule,
  id: number,
  member: FunctionMember,
  view = false,
): string[] {
  const name = module.spec.name;
  // A view's method: the view's number comes first; the view is found on the UI thread.
  const offset = view ? 1 : 0;
  const decoded = [
    ...(view ? ['val view = linkedView(args[0].number())'] : []),
    ...member.params.map(
      (param, index) => `val a${index} = ${decodeField(param, `args[${index + offset}]`)}`,
    ),
  ];
  const args = [...(view ? ['view'] : []), ...member.params.map((_, index) => `a${index}`)];
  const callee = `module.${identifier(member.name)}`;
  const result = member.result ? typeName(member.result) : 'Unit';
  const body = member.callback
    ? [
        `val promise = KuitoPromise<${result}>(reply) { ${member.result ? encode(member.result, 'it') : 'null'} }`,
        `${callee}(${[...args, 'promise'].join(', ')})`,
      ]
    : member.result
      ? [
          `val result = ${callee}(${args.join(', ')})`,
          `reply.resolve(${encode(member.result, 'result')})`,
        ]
      : [`${callee}(${args.join(', ')})`, 'reply.resolve(null)'];

  return [
    `        ${id} -> KuitoFunction(${JSON.stringify(`${name}.${member.name}`)}, KuitoThread.${THREADS[member.thread]}, ${member.params.length + offset}, ${JSON.stringify(signatures.function(member.params, member.result, view ? ['n'] : []))}) { link, args, reply ->`,
    `            val module: ${name}Spec = link.${accessorName(name)}()`,
    ...[...decoded, ...body].map((line) => '            ' + line),
    '        }',
  ];
}

/** A view's own id registers its kind with the renderer, on the JS thread, as the kernel plans it. */
function viewEntry(module: CatalogModule, id: number, member: ViewMember): string[] {
  const name = module.spec.name;

  return [
    `        ${id} -> KuitoFunction(${JSON.stringify(`${name}.${member.name}`)}, KuitoThread.JS, 0, "()_") { link, _, reply ->`,
    `            val module: ${name}Spec = link.${accessorName(name)}()`,
    `            module.${identifier(member.name)}().register(${JSON.stringify(name)}, listOf(${member.events.map((event) => JSON.stringify(event)).join(', ')}))`,
    '            reply.resolve(null)',
    '        }',
  ];
}

/** What a module's `start<Name>` is given for each kind of observed member. */
const SENDERS = { event: 'KuitoEmitter', live: 'KuitoSignal', motion: 'KuitoMotion' } as const;

function observer(
  signatures: Signatures,
  module: CatalogModule,
  id: number,
  member: Member,
): string[] {
  if (member.kind === 'function' || member.kind === 'view') return [];

  const name = module.spec.name;
  const start = capitalized(member.name);
  const type = member.kind === 'event' ? member.payload : member.type;
  const sender = SENDERS[member.kind];
  const accessor = `val module: ${name}Spec = link.${accessorName(name)}()`;

  return [
    `        ${id} -> KuitoObserver(${JSON.stringify(`${name}.${member.name}`)}, ${JSON.stringify(signatures.observed(type))}, { link, emit ->`,
    `            ${accessor}`,
    `            module.start${start}(${sender}<${type ? typeName(type) : 'Unit'}>(emit) { ${type ? encode(type, 'it') : 'null'} })`,
    '        }, { link ->',
    `            ${accessor}`,
    `            module.stop${start}()`,
    member.kind === 'motion' ? '        }, motion = true)' : '        })',
  ];
}

/**
 * KuitoLink.kt: the interfaces and types of `modules` (the shell's Android
 * modules with a spec) and the entries of the `ids` the bundle calls.
 */
export function kotlinLink(
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
    'package dev.kuito.link',
    '',
    'import dev.kuito.runtime.link.KuitoEmitter',
    'import dev.kuito.runtime.link.KuitoEncodable',
    'import dev.kuito.runtime.link.KuitoEnum',
    'import dev.kuito.runtime.link.KuitoFunction',
    'import dev.kuito.runtime.link.KuitoLinkContext',
    'import dev.kuito.runtime.link.KuitoLinkedModule',
    'import dev.kuito.runtime.link.KuitoModuleView',
    'import dev.kuito.runtime.link.KuitoMotion',
    'import dev.kuito.runtime.link.linkedView',
    'import dev.kuito.runtime.link.register',
    'import dev.kuito.runtime.link.KuitoObserver',
    'import dev.kuito.runtime.link.KuitoPromise',
    'import dev.kuito.runtime.link.KuitoSignal',
    'import dev.kuito.runtime.link.KuitoArgument',
    'import dev.kuito.runtime.modules.KuitoThread',
    '',
    ...types.flatMap(declaration),
    ...modules.flatMap(contract),
    ...accessors.map(
      (module) =>
        `private fun KuitoLinkContext.${accessorName(module.spec.name)}() = ` +
        `module(${JSON.stringify(module.spec.name)}) { ${kotlinClass(module)}(it) }`,
    ),
    '',
    '/** The members the bundle uses, by id; any other id is not linked into this shell. */',
    'object KuitoLink {',
    "    /** As the app's process starts: the included modules that ask for it. */",
    '    fun launch(application: android.app.Application) {',
    ...modules
      .filter((module) => launches(module, 'android'))
      .map((module) => `        ${kotlinClass(module)}.launch(application)`),
    '    }',
    '',
    '    fun function(id: Int): KuitoFunction? = when (id) {',
    ...called.flatMap(({ id, module, member, view }) => {
      const included = modules.find(({ spec }) => spec === module);

      if (!included) return [];

      switch (member.kind) {
        case 'event':
        case 'motion':
          return [];
        case 'live':
          return entry(signatures, included, id, liveRead(member));
        case 'view':
          return viewEntry(included, id, member);
        case 'function':
          return entry(signatures, included, id, member, view !== undefined);
      }
    }),
    '        else -> null',
    '    }',
    '',
    '    fun observer(id: Int): KuitoObserver? = when (id) {',
    ...called.flatMap(({ id, module, member }) => {
      const included = modules.find(({ spec }) => spec === module);

      return included ? observer(signatures, included, id, member) : [];
    }),
    '        else -> null',
    '    }',
    '}',
    '',
  ].join('\n');
}

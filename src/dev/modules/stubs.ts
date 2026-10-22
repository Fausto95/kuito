/**
 * What a spec compiles to: one stub per function, bound by the kernel to the
 * function's id, its thread and the schema its arguments are checked
 * against before they cross (src/runtime/link.ts). Each stub is pure, so the
 * bundler drops every function the app does not call; the ones left are the
 * shell's link table.
 */
import type { ModuleCatalog } from './catalog.ts';
import type { Field, FunctionMember, ModuleSpec, NamedType, SpecType } from './spec.ts';

/**
 * An argument's schema, as the kernel reads it: `n` number, `s` string,
 * `b` boolean, `j` JSON, `x` an ArrayBuffer, `['?', T]` null or absent, `['a', T]` array,
 * `['r', T]` record of string keys, `['e', ...values]` string enum,
 * `['o', [[field, T], ...]]` object.
 */
export type ArgumentSchema = string | (string | ArgumentSchema | [string, ArgumentSchema][])[];

const SCALARS: Record<string, string> = {
  number: 'n',
  string: 's',
  boolean: 'b',
  json: 'j',
  bytes: 'x',
};

/** Words a `const` cannot be named: the stub's local takes a `$` in front. */
const RESERVED_WORDS = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends ' +
    'false finally for function if import in instanceof new null return super switch this throw ' +
    'true try typeof var void while with yield let static implements interface package private ' +
    'protected public await arguments eval'
  ).split(' '),
);

/** The kernel function a member that is not a function binds through. */
const LINKERS = { event: 'linkEvent', live: 'linkLive', motion: 'linkMotion' } as const;

const localName = (name: string) => (RESERVED_WORDS.has(name) ? '$' + name : name);

function schemaOf(spec: ModuleSpec) {
  const named = new Map<string, NamedType>(spec.types.map((type) => [type.name, type]));
  const open = new Set<string>();

  function of(type: SpecType): ArgumentSchema {
    switch (type.kind) {
      case 'number':
      case 'string':
      case 'boolean':
      case 'json':
      case 'bytes':
        return SCALARS[type.kind];
      case 'nullable':
        return ['?', of(type.of)];
      case 'array':
        return ['a', of(type.of)];
      case 'record':
        return ['r', of(type.of)];
      case 'enum':
      case 'object':
        return namedSchema(type.name);
    }
  }

  function field({ name, type, optional }: Field): [string, ArgumentSchema] {
    const schema = of(type);

    return [name, optional && type.kind !== 'nullable' ? ['?', schema] : schema];
  }

  function namedSchema(name: string): ArgumentSchema {
    const type = named.get(name);

    if (!type) throw new Error(`${spec.file}: ${name} is not declared`);
    if (type.kind === 'enum') return ['e', ...type.values];

    if (open.has(name))
      throw new Error(
        `${spec.file}: ${name} contains itself; a function's arguments cannot nest without end`,
      );

    open.add(name);

    const fields = type.fields.map(field);

    open.delete(name);

    return ['o', fields];
  }

  return { field };
}

/** The stubs of module `name`, as an ES module the bundler compiles in place of its spec. */
export function moduleStubs(catalog: ModuleCatalog, name: string): string {
  const module = catalog.byName.get(name);

  if (!module) throw new Error(`No native module named ${name}`);

  const { field } = schemaOf(module.spec);
  const members = catalog.members.filter((linked) => linked.module === module.spec);
  // A main-thread function that returns its result is one UI-thread code calls directly.
  const call = (id: number, member: FunctionMember, prefix: ArgumentSchema[] = []) =>
    `globalThis.__kuito.link(${id}, ${JSON.stringify(`${name}.${member.name}`)}, ${JSON.stringify(
      member.thread,
    )}, ${JSON.stringify([...prefix, ...member.params.map((param) => field(param)[1])])}${
      member.thread === 'main' && !member.callback && prefix.length === 0 ? ', true' : ''
    })`;
  const lines = members
    .filter((linked) => !linked.view)
    .flatMap(({ id, member }) => {
      const local = localName(member.name);
      const qualified = JSON.stringify(`${name}.${member.name}`);
      let binding: string;

      switch (member.kind) {
        case 'function':
          binding = call(id, member);
          break;
        case 'event':
        case 'live':
        case 'motion':
          binding = `globalThis.__kuito.${LINKERS[member.kind]}(${id}, ${qualified})`;
          break;
        case 'view': {
          // A method's first argument is the view's number.
          const methods = members.flatMap((each) =>
            each.view === member && each.member.kind === 'function'
              ? [
                  `${JSON.stringify(each.member.name)}: /* @__PURE__ */ ${call(each.id, each.member, ['n'])}`,
                ]
              : [],
          );

          binding = `globalThis.__kuito.linkView(${id}, ${JSON.stringify(name)}, ${JSON.stringify(
            member.events,
          )}, { ${methods.join(', ')} }, ${member.children})`;

          break;
        }
      }

      return [
        `const ${local} = /* @__PURE__ */ ${binding};`,
        `export { ${local} as ${member.name} };`,
      ];
    });

  return [
    `// ${name}'s functions, linked by id (${module.spec.file}, docs/native-modules.md).`,
    ...lines,
    '',
  ].join('\n');
}

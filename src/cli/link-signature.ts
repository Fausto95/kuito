/**
 * A member's signature as the generated link table hands it to the C++
 * (native/shared/Link.h), which reads and builds its values by it: a struct's
 * fields by the names it declares, crossing in its order.
 *
 * `n` number, `s` string, `b` boolean, `j` Json, `x` an ArrayBuffer, `e` a string enum, `_`
 * nothing, `?T` null or T, `[T` array, `%T` record of string keys,
 * `{name:T,other?:T}` a struct whose `?` fields may be absent. A struct that
 * contains itself is named where it first appears, `=Node{children:[^Node}`,
 * and referred to by `^Node`. A function's is `(T,T)R`; an observed member's
 * `()T`, T what it sends.
 */
import type { Field, NamedType, SpecType } from '../dev/modules/spec.ts';

export function linkSignatures(types: readonly NamedType[]) {
  const named = new Map(types.map((type) => [type.name, type]));
  const recursive = new Set(
    types.filter((type) => reaches(type.name, type)).map(({ name }) => name),
  );

  function declared(name: string) {
    const type = named.get(name);

    if (type?.kind !== 'object') throw new Error(`${name} is not a declared object type`);

    return type;
  }

  /** Whether `type`'s fields lead back to `name`. */
  function reaches(name: string, type: NamedType, seen = new Set<string>()): boolean {
    if (type.kind !== 'object' || seen.has(type.name)) return false;

    seen.add(type.name);

    return type.fields.some(({ type: field }) => {
      let inner = field;

      while (inner.kind === 'nullable' || inner.kind === 'array' || inner.kind === 'record')
        inner = inner.of;

      if (inner.kind !== 'object') return false;

      const next = named.get(inner.name);

      return inner.name === name || (next !== undefined && reaches(name, next, seen));
    });
  }

  /** One signature's types: a struct that contains itself is defined once in it. */
  function writer() {
    const defined = new Set<string>();

    function of(type: SpecType): string {
      switch (type.kind) {
        case 'number':
          return 'n';
        case 'string':
          return 's';
        case 'boolean':
          return 'b';
        case 'json':
          return 'j';
        case 'bytes':
          return 'x';
        case 'nullable':
          return '?' + of(type.of);
        case 'array':
          return '[' + of(type.of);
        case 'record':
          return '%' + of(type.of);
        case 'enum':
          return 'e';
        case 'object': {
          const { name, fields } = declared(type.name);
          const body = () => '{' + fields.map(field).join(',') + '}';

          if (!recursive.has(name)) return body();
          if (defined.has(name)) return '^' + name;

          defined.add(name);

          return '=' + name + body();
        }
      }
    }

    const field = (each: Field) => `${each.name}${each.optional ? '?' : ''}:${of(each.type)}`;
    const parameter = ({ type, optional }: Field) =>
      optional && type.kind !== 'nullable' ? '?' + of(type) : of(type);

    return { of, parameter };
  }

  return {
    /** `params` after `prefix` (a view method's view number), then `result`. */
    function(params: readonly Field[], result: SpecType | null, prefix: readonly string[] = []) {
      const { of, parameter } = writer();

      return `(${[...prefix, ...params.map(parameter)].join(',')})${result ? of(result) : '_'}`;
    },
    /** What an event, a live value or a motion value sends. */
    observed(sent: SpecType | null) {
      return `()${sent ? writer().of(sent) : '_'}`;
    },
  };
}

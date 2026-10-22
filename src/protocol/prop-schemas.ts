// What the structured props' schemas (schemas.ts) generate: the tables C++
// checks a value against and lays it out by (native/shared/Schema.h), and the
// Swift and Kotlin value types that read the record back in the same order
// (docs/native-scheduling.md#structured-props). Plain data in, text out.
import type { Manifest } from './manifest.ts';
import type { Field, Schema, StructSchema, Variant, When } from './schemas.ts';

type Kind =
  | 'number'
  | 'integer'
  | 'string'
  | 'boolean'
  | 'color'
  | 'enum'
  | 'list'
  | 'map'
  | 'struct'
  | 'oneOf';

interface Node {
  kind: Kind;
  name: string;
  first: number;
  count: number;
}

export interface SchemaTables {
  nodes: Node[];
  fields: { name: string; node: number; optional: boolean }[];
  /** `of` names the oneOf, `name` the variant. */
  variants: { when: When; node: number; of: string; name: string }[];
  strings: string[];
  /** Each structured prop's root node, by prop name. */
  roots: Map<string, number>;
}

function fail(message: string): never {
  throw new Error('src/protocol/schemas.ts: ' + message);
}

const isOptional = (field: Field): field is { readonly optional: Schema } =>
  typeof field === 'object' && 'optional' in field;

const fieldSchema = (field: Field): Schema => (isOptional(field) ? field.optional : field);

/** The props whose values carry a schema, in the manifest's order. */
export function structuredProps(manifest: Manifest): [string, Schema][] {
  return Object.entries(manifest.props).flatMap(([name, spec]) =>
    spec.schema ? [[name, spec.schema] as [string, Schema]] : [],
  );
}

/** Every schema as flat tables; each struct, oneOf and enum named once. */
export function schemaTables(manifest: Manifest): SchemaTables {
  const tables: SchemaTables = {
    nodes: [],
    fields: [],
    variants: [],
    strings: [],
    roots: new Map(),
  };
  const seen = new Map<Schema, number>();
  const named = new Map<string, Schema>();

  const visit = (schema: Schema): number => {
    const known = seen.get(schema);

    if (known !== undefined) return known;

    const index = tables.nodes.length;

    seen.set(schema, index);

    if (typeof schema === 'string') {
      tables.nodes.push({ kind: schema, name: '', first: 0, count: 0 });

      return index;
    }

    const node: Node = { kind: 'number', name: '', first: 0, count: 0 };

    tables.nodes.push(node);

    const name =
      'struct' in schema
        ? schema.struct
        : 'oneOf' in schema
          ? schema.oneOf
          : 'enum' in schema
            ? schema.enum
            : '';

    if (name) {
      if (named.has(name) && named.get(name) !== schema) fail(`two schemas are named ${name}`);
      named.set(name, schema);
    }

    node.name = name;

    if ('enum' in schema) {
      node.kind = 'enum';
      node.first = tables.strings.length;
      node.count = schema.values.length;
      tables.strings.push(...schema.values);
    } else if ('list' in schema || 'map' in schema) {
      node.kind = 'list' in schema ? 'list' : 'map';
      node.count = 1;
      node.first = visit('list' in schema ? schema.list : schema.map);
    } else if ('struct' in schema) {
      const entries = Object.entries(schema.fields);

      node.kind = 'struct';
      node.first = tables.fields.length;
      node.count = entries.length;
      tables.fields.length += entries.length;

      entries.forEach(([field, spec], at) => {
        tables.fields[node.first + at] = {
          name: field,
          node: visit(fieldSchema(spec)),
          optional: isOptional(spec),
        };
      });
    } else {
      node.kind = 'oneOf';
      node.first = tables.variants.length;
      node.count = schema.variants.length;
      tables.variants.length += schema.variants.length;

      schema.variants.forEach((variant, at) => {
        tables.variants[node.first + at] = {
          when: variant.when,
          node: visit(variant.schema),
          of: schema.oneOf,
          name: variant.name,
        };
      });
    }

    return index;
  };

  for (const [prop, schema] of structuredProps(manifest)) tables.roots.set(prop, visit(schema));

  return tables;
}

// --- C++ ----------------------------------------------------------------------

const CPP_KINDS: Readonly<Record<Kind, string>> = {
  number: 'Number',
  integer: 'Integer',
  string: 'String',
  boolean: 'Boolean',
  color: 'Color',
  enum: 'Enum',
  list: 'List',
  map: 'Map',
  struct: 'Struct',
  oneOf: 'OneOf',
};

function cppWhen(when: When): string {
  if (typeof when === 'string')
    return `SchemaWhen::${when.charAt(0).toUpperCase()}${when.slice(1)}, nullptr, nullptr`;

  return 'has' in when
    ? `SchemaWhen::Has, "${when.has}", nullptr`
    : `SchemaWhen::Is, "${when.field}", "${when.is}"`;
}

/** Rows with their trailing comments aligned, as clang-format aligns them. */
function aligned(rows: [code: string, comment: string][]): string {
  const width = Math.max(...rows.map(([code]) => code.length));

  return rows.map(([code, comment]) => `${code.padEnd(width)} // ${comment}\n`).join('');
}

/** native/shared/PropSchemas.generated.h. */
export function cppSchemas(header: string, manifest: Manifest, tables: SchemaTables): string {
  return `// ${header}
#pragma once
#include <cstddef>
#include <cstdint>

namespace kuito {

/// A schema node (src/protocol/schemas.ts): a scalar, or a list, map, struct or
/// oneOf whose children are [first, first + count) of its table; an enum's
/// values are kSchemaStrings, a list's or map's item is node \`first\`.
enum class SchemaKind : std::uint8_t { Number, Integer, String, Boolean, Color, Enum, List, Map, Struct, OneOf };

/// What tells a oneOf's variant apart.
enum class SchemaWhen : std::uint8_t { String, Number, Boolean, List, Struct, Has, Is };

struct SchemaNode {
  SchemaKind kind;
  const char* name;
  std::uint16_t first;
  std::uint16_t count;
};

struct SchemaField {
  const char* name;
  std::uint16_t node;
  bool optional;
};

struct SchemaVariant {
  SchemaWhen when;
  /// Has and Is: the field; Is: the text it holds.
  const char* field;
  const char* is;
  std::uint16_t node;
};

inline constexpr SchemaNode kSchemaNodes[] = {
${aligned(
  tables.nodes.map((node, index) => [
    `    {SchemaKind::${CPP_KINDS[node.kind]}, "${node.name}", ${node.first}, ${node.count}},`,
    String(index),
  ]),
)}};

inline constexpr SchemaField kSchemaFields[] = {
${aligned(
  tables.fields.map((field, index) => [
    `    {"${field.name}", ${field.node}, ${field.optional}},`,
    String(index),
  ]),
)}};

inline constexpr SchemaVariant kSchemaVariants[] = {
${aligned(
  tables.variants.map((variant) => [
    `    {${cppWhen(variant.when)}, ${variant.node}},`,
    `${variant.of}.${variant.name}`,
  ]),
)}};

inline constexpr const char* kSchemaStrings[] = {
${aligned(tables.strings.map((text, index) => [`    "${text}",`, String(index)]))}};

/// Each prop's schema node, by its key (PropKeys.generated.h); -1 for a prop without one.
inline constexpr std::int32_t kPropSchemas[] = {
${aligned(Object.keys(manifest.props).map((name) => [`    ${tables.roots.get(name) ?? -1},`, name]))}};

} // namespace kuito
`;
}

// --- The record, laid out at generation time ----------------------------------

/** A record as C++ lays one out (native/shared/Schema.h). */
export interface FlatRecord {
  numbers: number[];
  strings: string[];
}

const typeOf = (value: unknown) =>
  Array.isArray(value)
    ? 'list'
    : value === null
      ? 'null'
      : typeof value === 'object'
        ? 'struct'
        : typeof value;

function matches(when: When, value: unknown): boolean {
  if (typeof when === 'string') return typeOf(value) === when;

  if (typeOf(value) !== 'struct') return false;

  const object = value as Record<string, unknown>;

  return 'has' in when ? Object.hasOwn(object, when.has) : object[when.field] === when.is;
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as 0xRRGGBBAA, as native/shared/HexColor.h reads it. */
function hexColor(text: string): number | null {
  const digits = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];

  if (!digits) return null;

  const full = digits.length <= 4 ? digits.replace(/./g, (digit) => digit + digit) : digits;

  return parseInt(full.length === 6 ? full + 'ff' : full, 16) >>> 0;
}

/**
 * `value` laid out by `schema` as C++ lays it out, for the unset values the
 * renderers' generated tables hold; throws for a value that does not fit.
 */
export function flattenValue(
  schema: Schema,
  value: unknown,
  out: FlatRecord = { numbers: [], strings: [] },
): FlatRecord {
  if (typeof schema === 'string') {
    const color = schema === 'color' && typeof value === 'string' ? hexColor(value) : null;

    if (schema === 'string' && typeof value === 'string') out.strings.push(value);
    else if (schema === 'boolean' && typeof value === 'boolean') out.numbers.push(value ? 1 : 0);
    else if (schema === 'number' && typeof value === 'number') out.numbers.push(value);
    else if (schema === 'integer' && Number.isInteger(value)) out.numbers.push(Number(value));
    else if (color !== null) out.numbers.push(color);
    else fail(`${JSON.stringify(value)} is not a ${schema}`);

    return out;
  }

  if ('enum' in schema) {
    const index = schema.values.indexOf(String(value));

    if (index === -1) fail(`${JSON.stringify(value)} is not one of ${schema.enum}`);
    out.numbers.push(index);
  } else if ('list' in schema) {
    if (!Array.isArray(value)) fail(`${JSON.stringify(value)} is not a list`);
    out.numbers.push(value.length);
    value.forEach((item: unknown) => flattenValue(schema.list, item, out));
  } else if ('map' in schema) {
    const entries = Object.entries(value as Record<string, unknown>);

    out.numbers.push(entries.length);

    entries.forEach(([key, item]) => {
      out.strings.push(key);
      flattenValue(schema.map, item, out);
    });
  } else if ('struct' in schema) {
    Object.entries(schema.fields).forEach(([name, field]) => {
      const given = (value as Record<string, unknown>)[name];
      const present = given !== undefined && given !== null;

      if (isOptional(field)) out.numbers.push(present ? 1 : 0);
      else if (!present) fail(`${schema.struct} needs ${name}`);

      if (present) flattenValue(fieldSchema(field), given, out);
    });
  } else {
    const at = schema.variants.findIndex((variant) => matches(variant.when, value));

    if (at === -1) fail(`${JSON.stringify(value)} is no ${schema.oneOf}`);
    out.numbers.push(at);
    flattenValue(schema.variants[at].schema, value, out);
  }

  return out;
}

// --- Swift and Kotlin -----------------------------------------------------------

type Language = 'swift' | 'kotlin';

const typeName = (name: string) => `Kuito${name}Value`;

const constant = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const caseName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

const SCALARS: Readonly<Record<Language, Readonly<Record<string, [type: string, read: string]>>>> =
  {
    swift: {
      number: ['Double', 'reader.number()'],
      integer: ['Int', 'reader.integer()'],
      string: ['String', 'reader.string()'],
      boolean: ['Bool', 'reader.flag()'],
      color: ['UInt32', 'reader.color()'],
    },
    kotlin: {
      number: ['Double', 'reader.number()'],
      integer: ['Int', 'reader.integer()'],
      string: ['String', 'reader.string()'],
      boolean: ['Boolean', 'reader.flag()'],
      color: ['Int', 'reader.color()'],
    },
  };

function nativeType(schema: Schema, language: Language): string {
  if (typeof schema === 'string') return SCALARS[language][schema][0];

  if ('list' in schema)
    return language === 'swift'
      ? `[${nativeType(schema.list, language)}]`
      : `List<${nativeType(schema.list, language)}>`;

  if ('map' in schema)
    return language === 'swift'
      ? `[String: ${nativeType(schema.map, language)}]`
      : `Map<String, ${nativeType(schema.map, language)}>`;

  return typeName(
    'struct' in schema ? schema.struct : 'oneOf' in schema ? schema.oneOf : schema.enum,
  );
}

function read(schema: Schema, language: Language): string {
  if (typeof schema === 'string') return SCALARS[language][schema][1];

  const swift = language === 'swift';

  if ('enum' in schema)
    return swift
      ? `${typeName(schema.enum)}.allCases[reader.integer()]`
      : `${typeName(schema.enum)}.entries[reader.integer()]`;

  if ('list' in schema)
    return swift
      ? `(0 ..< reader.integer()).map { _ in ${read(schema.list, language)} }`
      : `List(reader.integer()) { ${read(schema.list, language)} }`;

  if ('map' in schema)
    return swift
      ? `Dictionary(uniqueKeysWithValues: (0 ..< reader.integer()).map { _ in (reader.string(), ${read(schema.map, language)}) })`
      : `buildMap { repeat(reader.integer()) { put(reader.string(), ${read(schema.map, language)}) } }`;

  const name = typeName('struct' in schema ? schema.struct : schema.oneOf);

  return swift ? `${name}(&reader)` : `${name}.read(reader)`;
}

function readField(field: Field, language: Language): string {
  if (!isOptional(field)) return read(field, language);

  const value = read(field.optional, language);

  return language === 'swift'
    ? `reader.flag() ? ${value} : nil`
    : `if (reader.flag()) ${value} else null`;
}

function fieldType(field: Field, language: Language): string {
  return nativeType(fieldSchema(field), language) + (isOptional(field) ? '?' : '');
}

/** Every named schema, each once, in the order the props first reach it. */
function namedSchemas(
  manifest: Manifest,
): Exclude<Schema, string | { list: Schema } | { map: Schema }>[] {
  const found: Exclude<Schema, string | { list: Schema } | { map: Schema }>[] = [];
  const walk = (schema: Schema) => {
    if (typeof schema === 'string') return;
    if ('list' in schema) return walk(schema.list);
    if ('map' in schema) return walk(schema.map);
    if (found.includes(schema)) return;

    found.push(schema);

    if ('struct' in schema)
      Object.values(schema.fields).forEach((field) => walk(fieldSchema(field)));

    if ('oneOf' in schema) schema.variants.forEach((variant) => walk(variant.schema));
  };

  structuredProps(manifest).forEach(([, schema]) => walk(schema));

  return found;
}

function swiftType(schema: Exclude<Schema, string | { list: Schema } | { map: Schema }>): string {
  if ('enum' in schema)
    return `enum ${typeName(schema.enum)}: String, CaseIterable {
${schema.values.map((value) => `    case ${value}\n`).join('')}}
`;

  if ('struct' in schema)
    return `struct ${typeName(schema.struct)}: Equatable {
${Object.entries(schema.fields)
  .map(([name, field]) => `    let ${name}: ${fieldType(field, 'swift')}\n`)
  .join('')}
    init(_ reader: inout KuitoStructReader) {
${Object.entries(schema.fields)
  .map(([name, field]) => `        ${name} = ${readField(field, 'swift')}\n`)
  .join('')}    }
}
`;

  return `enum ${typeName(schema.oneOf)}: Equatable {
${schema.variants.map((variant: Variant) => `    case ${variant.name}(${nativeType(variant.schema, 'swift')})\n`).join('')}
    init(_ reader: inout KuitoStructReader) {
        switch reader.integer() {
${schema.variants
  .map(
    (variant, at) =>
      `        ${at === schema.variants.length - 1 ? 'default' : `case ${at}`}: self = .${variant.name}(${read(variant.schema, 'swift')})\n`,
  )
  .join('')}        }
    }
}
`;
}

function kotlinType(schema: Exclude<Schema, string | { list: Schema } | { map: Schema }>): string {
  if ('enum' in schema)
    return `internal enum class ${typeName(schema.enum)}(val wire: String) {
${schema.values.map((value) => `    ${constant(value)}("${value}"),\n`).join('')}}
`;

  if ('struct' in schema) {
    const struct: StructSchema = schema;

    return `internal data class ${typeName(struct.struct)}(
${Object.entries(struct.fields)
  .map(([name, field]) => `    val ${name}: ${fieldType(field, 'kotlin')},\n`)
  .join('')}) {
    companion object {
        fun read(reader: KuitoStructReader) = ${typeName(struct.struct)}(
${Object.entries(struct.fields)
  .map(([name, field]) => `            ${name} = ${readField(field, 'kotlin')},\n`)
  .join('')}        )
    }
}
`;
  }

  const name = typeName(schema.oneOf);

  return `internal sealed interface ${name} {
${schema.variants
  .map(
    (variant) =>
      `    data class ${caseName(variant.name)}(val value: ${nativeType(variant.schema, 'kotlin')}) : ${name}\n`,
  )
  .join('')}
    companion object {
        fun read(reader: KuitoStructReader): ${name} = when (reader.integer()) {
${schema.variants
  .map(
    (variant, at) =>
      `            ${at === schema.variants.length - 1 ? 'else' : at} -> ${caseName(variant.name)}(${read(variant.schema, 'kotlin')})\n`,
  )
  .join('')}        }
    }
}
`;
}

/** native/ios/Renderer/KuitoPropValues.generated.swift. */
export function swiftSchemas(header: string, manifest: Manifest): string {
  return `// ${header}

/// Each structured prop's value, read from the record C++ laid it out in
/// (native/shared/Schema.h, docs/native-scheduling.md#structured-props).
enum KuitoPropValues {
${structuredProps(manifest)
  .map(
    ([prop, schema]) => `    /// \`${prop}\`.
    static func ${prop}(_ record: KuitoStructRecord) -> ${nativeType(schema, 'swift')} {
        var reader = KuitoStructReader(record)

        return ${read(schema, 'swift')}
    }
`,
  )
  .join('\n')}}
${namedSchemas(manifest)
  .map((schema) => '\n' + swiftType(schema))
  .join('')}`;
}

/** .../renderer/KuitoPropValues.generated.kt. */
export function kotlinSchemas(header: string, manifest: Manifest): string {
  return `// ${header}
package dev.kuito.runtime.renderer

/**
 * Each structured prop's value, read from the record C++ laid it out in
 * (native/shared/Schema.h, docs/native-scheduling.md#structured-props).
 */
internal object KuitoPropValues {
${structuredProps(manifest)
  .map(
    ([prop, schema]) => `    /** \`${prop}\`. */
    fun ${prop}(record: KuitoStructRecord): ${nativeType(schema, 'kotlin')} {
        val reader = KuitoStructReader(record)

        return ${read(schema, 'kotlin')}
    }
`,
  )
  .join('\n')}}
${namedSchemas(manifest)
  .map((schema) => '\n' + kotlinType(schema))
  .join('')}`;
}

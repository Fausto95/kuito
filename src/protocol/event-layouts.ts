// The fixed layout each event payload crosses in (docs/events.md#typed-events),
// and the files generated from it: the kernels' table, the C++ checks, and the
// Swift and Kotlin types native fills a record with. Plain data in, text out.
import type { FieldType, Manifest } from './manifest.ts';

/** A slot in a record's numbers: a number, one that may be absent (NaN), or a boolean as 0 or 1. */
export type NumberField = readonly [name: string, type: Exclude<FieldType, 'string'>];

export interface EventLayout {
  /** The payload's name in the manifest. */
  name: string;
  /** Its number on the wire: 1 for the manifest's first payload; 0 is no payload. */
  id: number;
  numbers: readonly NumberField[];
  strings: readonly string[];
}

/** Every payload's layout, in the manifest's order: fields keep their order within each array. */
export function eventLayouts(manifest: Manifest): EventLayout[] {
  return Object.entries(manifest.payloads).map(([name, fields], index) => ({
    name,
    id: index + 1,
    numbers: Object.entries(fields).flatMap(([field, type]): NumberField[] =>
      type === 'string' ? [] : [[field, type]],
    ),
    strings: Object.entries(fields).flatMap(([field, type]) => (type === 'string' ? [field] : [])),
  }));
}

/** The most number slots any layout has: the size of a reusable record. */
export function maxEventNumbers(layouts: readonly EventLayout[]): number {
  return Math.max(0, ...layouts.map((layout) => layout.numbers.length));
}

/**
 * FNV-1a over every layout, as a shell and a kernel each compile it in: a
 * shell built before a manifest change refuses a kernel built after it,
 * rather than read its fields from the wrong slots.
 */
export function layoutHash(layouts: readonly EventLayout[]): number {
  const text = layouts
    .map(
      (layout) =>
        `${layout.id}:${layout.name}(${layout.numbers.map(([name, type]) => name + ' ' + type).join(',')}|${layout.strings.join(',')})`,
    )
    .join(';');
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;

  return hash;
}

const hex = (value: number) => '0x' + value.toString(16).padStart(8, '0');

const quote = (text: string) => `'${text}'`;

/**
 * The kernels' table: each layout by id, and the layout each view kind sends
 * an event in (`all` for every kind), and each system event's.
 */
export function kernelLayouts(manifest: Manifest, layouts: readonly EventLayout[]): string {
  const ids = new Map(layouts.map((layout) => [layout.name, layout.id]));
  const idOf = (payload: string | null) => (payload === null ? 0 : (ids.get(payload) ?? 0));

  return `
/**
 * Each event payload's fixed layout, by its id (docs/events.md#typed-events):
 * numbers and booleans by slot in the record's numbers, strings by slot in
 * its strings. Id 0 is an event with no payload.
 */
export const EVENT_LAYOUTS: readonly (EventLayout | null)[] = [
  null,
${layouts
  .map(
    (layout) =>
      `  {\n    name: ${quote(layout.name)},\n    numbers: [${layout.numbers
        .map(([name, type]) => `[${quote(name)}, ${quote(type)}]`)
        .join(', ')}],\n    strings: [${layout.strings.map(quote).join(', ')}],\n  },\n`,
  )
  .join('')}];

/** The most number slots a layout has: the size of each kernel's reusable record. */
export const EVENT_NUMBERS = ${maxEventNumbers(layouts)};

/** The layouts' fingerprint, which a shell checks against its own before the first event. */
export const EVENT_LAYOUT_HASH = ${hex(layoutHash(layouts))};

/** The layout each kind sends each event in, by event, then kind (\`all\` for every kind). */
export const EVENT_RECORDS: Readonly<Record<string, Readonly<Record<string, number>>>> =
  Object.freeze({
${Object.entries(manifest.events)
  .map(
    ([event, kinds]) =>
      `    ${event}: { ${Object.entries(kinds)
        .map(([kind, payload]) => `${kind}: ${idOf(payload ?? null)}`)
        .join(', ')} },\n`,
  )
  .join('')}  });

/** The layout of each event of the app (handle 0), by \`<target>.<event>\`. */
export const SYSTEM_EVENT_RECORDS: Readonly<Record<string, number>> = Object.freeze({
${Object.entries(manifest.systemEvents)
  .flatMap(([target, events]) =>
    Object.entries(events).map(
      ([event, payload]) => `  ${quote(target + '.' + event)}: ${idOf(payload)},\n`,
    ),
  )
  .join('')}});
`;
}

/** native/shared/EventLayouts.generated.h: what C++ checks a record against. */
export function cppLayouts(header: string, layouts: readonly EventLayout[]): string {
  return `// ${header}
#pragma once
#include <cstddef>
#include <cstdint>

namespace kuito {

/// An event payload's fixed layout (docs/events.md#typed-events): how many
/// numbers and strings its record holds. Index 0 is no payload.
struct EventLayout {
  const char* name;
  std::uint8_t numbers;
  std::uint8_t strings;
};

inline constexpr EventLayout kEventLayouts[] = {
    {"", 0, 0},
${layouts.map((layout) => `    {"${layout.name}", ${layout.numbers.length}, ${layout.strings.length}},\n`).join('')}};

inline constexpr std::size_t kEventLayoutCount = ${layouts.length + 1};

/// The most numbers a record holds: the size of each kernel's reusable buffer.
inline constexpr std::size_t kEventNumbers = ${maxEventNumbers(layouts)};

/// The layouts' fingerprint (\`EVENT_LAYOUT_HASH\` in the kernels): a kernel
/// built from another manifest is refused before its first event.
inline constexpr std::uint32_t kEventLayoutHash = ${hex(layoutHash(layouts))};

} // namespace kuito
`;
}

const SWIFT_TYPES: Readonly<Record<FieldType, string>> = {
  number: 'Double',
  'number?': 'Double?',
  string: 'String',
  boolean: 'Bool',
};

const KOTLIN_TYPES: Readonly<Record<FieldType, string>> = {
  number: 'Double',
  'number?': 'Double?',
  string: 'String',
  boolean: 'Boolean',
};

/** How each field's value goes into a record slot, by its type. */
function slotValue(name: string, type: FieldType, language: 'swift' | 'kotlin'): string {
  if (type === 'boolean')
    return language === 'swift' ? `${name} ? 1 : 0` : `if (${name}) 1.0 else 0.0`;

  if (type === 'number?') return language === 'swift' ? `${name} ?? .nan` : `${name} ?: Double.NaN`;

  return name;
}

function fieldsOf(manifest: Manifest, layout: EventLayout): [string, FieldType][] {
  return Object.entries(manifest.payloads[layout.name]);
}

/** native/ios/Renderer/KuitoEvents.generated.swift: a struct per payload. */
export function swiftLayouts(
  header: string,
  manifest: Manifest,
  layouts: readonly EventLayout[],
): string {
  return `// ${header}

/// An event's payload, which writes its fields into a record in its layout's
/// order (native/shared/EventLayouts.generated.h, docs/events.md#typed-events).
protocol KuitoEventPayload {
    static var layout: Int32 { get }
    func write(to record: KuitoEventRecord)
}

extension KuitoEventRecord {
    /// The most numbers a record holds.
    static let capacity = ${maxEventNumbers(layouts)}
}
${layouts
  .map(
    (layout) => `
/// ${layout.name} (src/protocol/manifest.ts).
struct Kuito${layout.name}: KuitoEventPayload {
    static let layout: Int32 = ${layout.id}
${fieldsOf(manifest, layout)
  .map(
    ([name, type]) =>
      `    var ${name}: ${SWIFT_TYPES[type]}${type === 'number?' ? ' = nil' : ''}\n`,
  )
  .join('')}
    func write(to record: KuitoEventRecord) {
        record.begin(Self.layout)
${layout.numbers.map(([name, type]) => `        record.number(${slotValue(name, type, 'swift')})\n`).join('')}${layout.strings.map((name) => `        record.string(${name})\n`).join('')}    }
}
`,
  )
  .join('')}`;
}

/** .../renderer/KuitoEvents.generated.kt: a class per payload. */
export function kotlinLayouts(
  header: string,
  manifest: Manifest,
  layouts: readonly EventLayout[],
): string {
  return `// ${header}
package dev.kuito.runtime.renderer

/**
 * An event's payload, which writes its fields into a record in its layout's
 * order (native/shared/EventLayouts.generated.h, docs/events.md#typed-events).
 */
internal sealed interface KuitoEventPayload {
    fun write(record: KuitoEventRecord)
}

/** The most numbers a record holds. */
internal const val KUITO_EVENT_NUMBERS = ${maxEventNumbers(layouts)}
${layouts
  .map(
    (layout) => `
/** ${layout.name} (src/protocol/manifest.ts). */
internal class Kuito${layout.name}(
${fieldsOf(manifest, layout)
  .map(
    ([name, type]) =>
      `    val ${name}: ${KOTLIN_TYPES[type]}${type === 'number?' ? ' = null' : ''},\n`,
  )
  .join('')}) : KuitoEventPayload {
    override fun write(record: KuitoEventRecord) {
        record.begin(${layout.id})
${layout.numbers.map(([name, type]) => `        record.number(${slotValue(name, type, 'kotlin')})\n`).join('')}${layout.strings.map((name) => `        record.string(${name})\n`).join('')}    }
}
`,
  )
  .join('')}`;
}

// Native events as the shells write them (docs/events.md#typed-events): a
// payload's fields into a kernel's reusable record, in the layout
// src/protocol/manifest.ts declares for the view's kind and the event. A
// module view's events, which the manifest does not describe, stay JSON.
import {
  EVENT_LAYOUTS,
  EVENT_RECORDS,
  SYSTEM_EVENT_RECORDS,
} from '../runtime/protocol.generated.ts';

/** A layout as the generated table holds it (src/runtime/event-records.ts). */
interface Layout {
  name: string;
  numbers: readonly (readonly [name: string, type: 'number' | 'number?' | 'boolean'])[];
  strings: readonly string[];
}

const ZEROS = { number: 0, boolean: false } as const;

// The table's own type names a kernel module Node cannot resolve from here.
const LAYOUTS: readonly (Layout | null)[] = EVENT_LAYOUTS;

/**
 * The layout `kind` sends `event` in (`kind` null for the app's events,
 * named `<target>.<event>`); null for an event the manifest does not lay out.
 */
export function eventLayout(kind: string | null, event: string): number | null {
  if (kind === null)
    return Object.hasOwn(SYSTEM_EVENT_RECORDS, event) ? SYSTEM_EVENT_RECORDS[event] : null;

  if (!Object.hasOwn(EVENT_RECORDS, event)) return null;

  const kinds = EVENT_RECORDS[event];

  if (Object.hasOwn(kinds, kind)) return kinds[kind];

  return Object.hasOwn(kinds, 'all') ? kinds.all : null;
}

/**
 * Writes `payload` into `numbers` in layout `layout`'s order and returns its
 * strings, as a renderer's generated payload type does. A field the layout
 * lacks throws, and so does a required one missing unless `zero`, for a
 * test's shorthand, writes it as 0, false or empty text.
 */
export function writeRecord(
  layout: number,
  payload: Readonly<Record<string, unknown>>,
  numbers: Float64Array,
  { zero = false }: { zero?: boolean } = {},
): string[] | undefined {
  const spec = LAYOUTS[layout];

  if (layout === 0) {
    if (Object.keys(payload).length) throw new TypeError('This event carries no payload');

    return undefined;
  }

  if (!spec) throw new TypeError('Unknown event layout ' + layout);

  const known = new Set([...spec.numbers.map(([name]) => name), ...spec.strings]);

  for (const name of Object.keys(payload))
    if (!known.has(name)) throw new TypeError(`${spec.name} has no field ${name}`);

  spec.numbers.forEach(([name, type], slot) => {
    const given = payload[name];
    const value = given === undefined && zero && type !== 'number?' ? ZEROS[type] : given;

    if (type === 'boolean' && typeof value === 'boolean') numbers[slot] = value ? 1 : 0;
    else if (type !== 'boolean' && typeof value === 'number') numbers[slot] = value;
    else if (type === 'number?' && value === undefined) numbers[slot] = NaN;
    else throw new TypeError(`${spec.name}.${name} must be a ${type.replace('?', '')}`);
  });

  if (!spec.strings.length) return undefined;

  return spec.strings.map((name) => {
    const value = payload[name] === undefined && zero ? '' : payload[name];

    if (typeof value !== 'string') throw new TypeError(`${spec.name}.${name} must be a string`);

    return value;
  });
}

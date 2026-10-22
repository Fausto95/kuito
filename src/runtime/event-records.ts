// Native events in their typed records (docs/events.md#typed-events): native
// writes a payload's numbers into a kernel's reusable buffer and passes its
// strings, in the fixed layout src/protocol/manifest.ts declares; a kernel
// reads them out here. Shared by both kernels; imports only generated tables.
import { EVENT_LAYOUTS, EVENT_NUMBERS } from './protocol.generated';

/** A payload's layout: its number slots by name and type, then its string slots. */
export interface EventLayout {
  name: string;
  numbers: readonly (readonly [name: string, type: 'number' | 'number?' | 'boolean'])[];
  strings: readonly string[];
}

/** A kernel's reusable record: native writes each event's numbers here before calling it. */
export function eventBuffer(): Float64Array {
  return new Float64Array(EVENT_NUMBERS);
}

/**
 * The payload of layout `layout` out of `numbers` and `strings`, as a new
 * object. Read before anything runs that could send another event: the next
 * one reuses the buffer. An optional number that is NaN is absent; any other
 * number JSON cannot hold reads as null, as it did when events were JSON.
 */
export function readRecord(
  layout: number,
  numbers: Float64Array,
  strings: readonly unknown[] | undefined,
): Record<string, unknown> {
  const spec = layout === 0 ? null : EVENT_LAYOUTS[layout];
  const payload: Record<string, unknown> = {};

  if (layout === 0) return payload;

  if (!spec) throw new TypeError('Unknown event layout ' + layout);

  if ((strings?.length ?? 0) !== spec.strings.length)
    throw new TypeError(spec.name + ' takes ' + spec.strings.length + ' strings');

  for (let slot = 0; slot < spec.numbers.length; slot++) {
    const [name, type] = spec.numbers[slot];
    const value = numbers[slot];

    if (type === 'boolean') payload[name] = value === 1;
    else if (isFinite(value)) payload[name] = value;
    else if (type === 'number' || value === value) payload[name] = null;
  }

  for (let slot = 0; slot < spec.strings.length; slot++) {
    const text = strings?.[slot];

    if (typeof text !== 'string') throw new TypeError(spec.name + ' takes text for its strings');

    payload[spec.strings[slot]] = text;
  }

  return payload;
}

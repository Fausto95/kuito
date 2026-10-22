// The device side of the Live Patch link, read at the boundary: a shell's
// message is checked against src/protocol/dev-link.ts before the hub acts on it.
import { DEV_LINK, type DeviceMessage, type FieldType } from '../protocol/dev-link.ts';

const CHECKS: Record<FieldType, (value: unknown) => boolean> = {
  string: (value) => typeof value === 'string',
  'string?': (value) => value === undefined || typeof value === 'string',
  integer: (value) => Number.isInteger(value),
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  json: () => true,
};

const ARTICLES: Record<FieldType, string> = {
  string: 'a string',
  'string?': 'a string',
  integer: 'an integer',
  number: 'a number',
  json: 'JSON',
};

/** A device message, or an Error saying what is wrong with it. */
export function parseDeviceMessage(data: string): DeviceMessage {
  let message: unknown;

  try {
    message = JSON.parse(data);
  } catch {
    throw new Error('not JSON');
  }

  if (typeof message !== 'object' || message === null || Array.isArray(message))
    throw new Error('not an object');

  const type = Reflect.get(message, 'type');
  const specs: Readonly<Record<string, { fields: Readonly<Record<string, FieldType>> }>> =
    DEV_LINK.device;
  const spec = typeof type === 'string' && Object.hasOwn(specs, type) ? specs[type] : undefined;

  if (!spec) throw new Error(`unknown type ${String(type)}`);

  for (const [field, kind] of Object.entries(spec.fields))
    if (!CHECKS[kind](Reflect.get(message, field)))
      throw new Error(`${String(type)}.${field} must be ${ARTICLES[kind]}`);

  // Every field the type declares was checked above.
  return message as never;
}

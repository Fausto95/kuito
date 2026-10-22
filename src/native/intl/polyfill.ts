// Adds the Intl constructors Hermes lacks (docs/web-apis.md#intl), and keeps
// any the runtime has.
import { nativeFormats, type IntlNative } from './native-formats';
import { PluralRules } from './plural-rules';

/** Adds `value` as `intl[name]`, as a built-in: writable and configurable, not enumerable. */
export function addToIntl(intl: object, name: string, value: unknown): void {
  if (!(name in intl))
    Object.defineProperty(intl, name, { value, writable: true, configurable: true });
}

export function polyfillIntl(intl: object, native: IntlNative): void {
  const added: Record<string, unknown> = { PluralRules, ...nativeFormats(native) };

  for (const [name, value] of Object.entries(added)) addToIntl(intl, name, value);
}

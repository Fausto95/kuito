// The rule for JSX attributes the compiler, the kernel and List share:
// an on<Event> attribute is a callback, never a reactive value, and
// callbacks and identities pass through as they are. Imports nothing, so the
// kernel, app code and the Node compiler all load it.

/** Identities, never reactive values. */
const IDENTITIES = ['ref', 'key', 'id'];

/** `on` and a capital: `onPress`, `onReachEnd`. */
export function isCallbackAttribute(name: string): boolean {
  return /^on[A-Z]/.test(name);
}

/** Passed as written: a callback or an identity, not wrapped to be read reactively. */
export function isVerbatimAttribute(name: string): boolean {
  return isCallbackAttribute(name) || IDENTITIES.includes(name);
}

// Stores (docs/reactivity.md#stores): an object or array whose every path is
// a signal, after Solid's mutable stores. Each object behind a store has one
// proxy; reading a property through it tracks that property alone, and a
// write notifies only the bindings that read it.

/** What one object of a store tracks: a signal per property read, and one for its set of keys. */
interface Tracked {
  properties: Map<PropertyKey, { value: unknown }>;
  keys: { value: number } | null;
}

const proxies = new WeakMap<object, object>();
const targets = new WeakMap<object, object>();
const tracked = new WeakMap<object, Tracked>();

function kernel() {
  if (!globalThis.__kuito) throw new Error('store() requires the Kuito runtime');

  return globalThis.__kuito;
}

/** Plain objects and arrays become stores; class instances, dates and maps stay as they are. */
function storable(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false;

  const prototype: unknown = Object.getPrototypeOf(value);

  return Array.isArray(value) || prototype === Object.prototype || prototype === null;
}

function trackedOf(target: object): Tracked {
  const known = tracked.get(target);

  if (known) return known;

  const created: Tracked = { properties: new Map(), keys: null };

  tracked.set(target, created);

  return created;
}

/** The signal of `key` on `target`, made on its first read with the value it has now. */
function property(target: object, key: PropertyKey): { value: unknown } {
  const { properties } = trackedOf(target);
  const known = properties.get(key);

  if (known) return known;

  const created = kernel().createSignal<unknown>(Reflect.get(target, key));

  properties.set(key, created);

  return created;
}

function keysOf(target: object): { value: number } {
  const entry = trackedOf(target);

  entry.keys ??= kernel().createSignal(0);

  return entry.keys;
}

/** The signal of `key` changes to the value `target` holds now; untouched if nobody read it. */
function changed(target: object, key: PropertyKey): void {
  const signal = tracked.get(target)?.properties.get(key);

  if (signal) signal.value = Reflect.get(target, key);
}

function keysChanged(target: object): void {
  const keys = tracked.get(target)?.keys;

  if (keys) keys.value = kernel().untracked(() => keys.value) + 1;
}

/** Whether `key` is a method or accessor the target inherits, which nothing tracks. */
function inherited(target: object, key: PropertyKey): boolean {
  return !Object.prototype.hasOwnProperty.call(target, key) && key in target;
}

function unwrap(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? (targets.get(value) ?? value) : value;
}

function wrap(value: unknown): unknown {
  return storable(value) ? proxyOf(value) : value;
}

const handler: ProxyHandler<object> = {
  get(target, key, receiver) {
    if (typeof key === 'symbol' || inherited(target, key))
      return Reflect.get(target, key, receiver);

    void property(target, key).value;

    return wrap(Reflect.get(target, key));
  },
  set(target, key, value) {
    const added = !Object.prototype.hasOwnProperty.call(target, key);
    const length = Array.isArray(target) ? target.length : 0;

    Reflect.set(target, key, unwrap(value));
    changed(target, key);

    if (Array.isArray(target) && target.length !== length) {
      changed(target, 'length');

      // A shorter array dropped the indexes past its end.
      for (let index = target.length; index < length; index++) changed(target, String(index));

      keysChanged(target);
    } else if (added) keysChanged(target);

    return true;
  },
  deleteProperty(target, key) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) return true;

    Reflect.deleteProperty(target, key);
    changed(target, key);
    keysChanged(target);

    return true;
  },
  has(target, key) {
    void keysOf(target).value;

    return Reflect.has(target, key);
  },
  ownKeys(target) {
    void keysOf(target).value;

    return Reflect.ownKeys(target);
  },
};

/** Whether `value` is an object of a store. */
export function isStore(value: unknown): boolean {
  return typeof value === 'object' && value !== null && targets.has(value);
}

function proxyOf(target: object): object {
  const known = proxies.get(target);

  if (known) return known;

  const proxy = new Proxy(target, handler);

  proxies.set(target, proxy);
  targets.set(proxy, target);

  return proxy;
}

/**
 * A store over `initial`, which it wraps rather than copies: every path is a
 * signal. A read inside JSX (`item.liked`) follows that path alone, and a
 * write through the store (`items[3].liked = true`, `items.push(next)`)
 * updates only the bindings that read what changed. Made while a component
 * sets up, it belongs to that component's slot, as `signal()` does.
 */
export function store<T extends object>(initial: T, name?: string): T {
  if (!storable(initial)) throw new TypeError('store() takes an object or an array');

  const kuito = kernel();
  // The proxy has the target's type: it reads and writes the same properties.
  const made: T = proxyOf(initial) as never;

  return kuito.setup() ? kuito.useState(made, name).value : made;
}

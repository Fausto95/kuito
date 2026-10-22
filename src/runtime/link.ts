// Linked module functions (docs/native-modules.md): a spec's stub binds each
// function to its id, the thread it runs on and its arguments' schema, which
// the compiler wrote. Arguments are checked here, then cross as values with
// the id; nothing is dispatched by name, and only a failure carries a code
// and a message back.
import { host } from './host';
import { ERROR_CODES } from './protocol.generated';
import { reportError } from './errors';
import { queueOperation } from './operations';
import { createSource } from './signals';
import { platformMotion } from './motion-values';
import { counters, linked, moduleCalls } from './state/linked';
import { describeValue, isFunction, isPlainData, own, sameData } from './values';

declare global {
  /** Runs a `js` function and returns its result; a failure throws `__kuitoLinkError`'s error. */
  var __kuitoHostCall: ((id: number, ...args: unknown[]) => unknown) | undefined;
  /** Starts a `main` or `background` function; the host settles `call` later. */
  var __kuitoHostCallAsync: ((id: number, call: number, ...args: unknown[]) => void) | undefined;
  /** Starts or stops the platform sending an event's or a live value's changes. */
  var __kuitoHostObserve: ((id: number, observing: boolean) => void) | undefined;
  /** What the platform sends for an observed event or live value. */
  var __kuitoLinkEmit: (id: number, value: unknown) => void;
  var __kuitoLinkSettle: (call: number, value: unknown) => void;
  var __kuitoLinkFail: (call: number, code: string, message: string) => void;
  /** The error a failed synchronous call throws, made for the host to throw it. */
  var __kuitoLinkError: (id: number, code: string, message: string) => Error;
}

/** An argument's schema, as src/dev/modules/stubs.ts writes it. */
type Schema = string | readonly unknown[];

export interface NativeModuleError extends Error {
  code: string;
}

export function moduleError(code: string, message: string): NativeModuleError {
  return Object.assign(new Error(message), { name: 'NativeModuleError', code });
}

const argumentError = (message: string) => moduleError(ERROR_CODES.argument, message);

const SCALARS: Record<string, [string, (value: unknown) => boolean]> = {
  n: ['a finite number', (value) => typeof value === 'number' && isFinite(value)],
  s: ['a string', (value) => typeof value === 'string'],
  b: ['true or false', (value) => typeof value === 'boolean'],
  // By its tag: a buffer from another realm (a test's) is one too.
  x: [
    'an ArrayBuffer',
    (value) => Object.prototype.toString.call(value) === '[object ArrayBuffer]',
  ],
};

/** What `schema` accepts, for an error: `a string`, `'saver' or 'normal'`. */
function expected(schema: Schema): string {
  if (typeof schema === 'string') return own(SCALARS, schema) ? SCALARS[schema][0] : 'JSON data';

  switch (schema[0]) {
    case '?':
      return expected(schema[1] as Schema) + ', or absent';
    case 'a':
      return 'an array of ' + plural(schema[1] as Schema);
    case 'r':
      return 'an object of ' + plural(schema[1] as Schema);
    case 'e':
      return schema
        .slice(1)
        .map((value) => "'" + String(value) + "'")
        .join(' or ');
    default:
      return 'an object';
  }
}

const plural = (schema: Schema) =>
  typeof schema === 'string' && own(SCALARS, schema)
    ? SCALARS[schema][0].replace(/^an? /, '') + 's'
    : 'values';

/**
 * `value` as it crosses: checked against `schema`, with undefined fields
 * left out and an absent optional value null. `at` names it in an error.
 */
function checked(value: unknown, schema: Schema, at: string): unknown {
  const fail = (): never => {
    throw argumentError(at + ' must be ' + expected(schema) + ': ' + describeValue(value));
  };

  if (typeof schema === 'string') {
    if (schema === 'j') return isJson(value) ? value : fail();

    return SCALARS[schema][1](value) ? value : fail();
  }

  const inner = schema[1] as Schema;

  switch (schema[0]) {
    case '?':
      return value === undefined || value === null ? null : checked(value, inner, at);
    case 'e':
      return schema.indexOf(value, 1) > 0 ? value : fail();
    case 'a':
      return Array.isArray(value)
        ? value.map((item: unknown, index) => checked(item, inner, at + '[' + index + ']'))
        : fail();
    case 'r': {
      if (!isPlainData(value)) return fail();

      const record: Record<string, unknown> = {};

      Object.keys(value).forEach((key) => {
        record[key] = checked(value[key], inner, at + '.' + key);
      });

      return record;
    }
    default:
      return object(value, schema[1] as [string, Schema][], at, fail);
  }
}

function object(value: unknown, fields: [string, Schema][], at: string, fail: () => never) {
  if (!isPlainData(value)) return fail();

  const record: Record<string, unknown> = {};
  const known: Record<string, true> = {};
  const prefix = at.indexOf("'s ") === -1 ? at + "'s " : at + '.';

  fields.forEach(([name, schema]) => {
    known[name] = true;

    const field = checked(value[name], schema, prefix + name);

    // An absent optional field stays absent; null is a value.
    if (field !== null || value[name] === null) record[name] = field;
  });

  Object.keys(value).forEach((key) => {
    if (!known[key] && value[key] !== undefined)
      throw argumentError(at + ' has no field ' + key + ': ' + describeValue(value));
  });

  return record;
}

function isJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);

  return isPlainData(value) && Object.keys(value).every((key) => isJson(value[key]));
}

/** The arguments as they cross: one per parameter, each checked. */
function argumentsOf(name: string, params: readonly Schema[], args: unknown[]): unknown[] {
  let count = args.length;

  // Trailing absent arguments are optional ones left out.
  while (count > params.length && args[count - 1] === undefined) count--;

  if (count > params.length || params.slice(count).some((schema) => schema[0] !== '?'))
    throw argumentError(name + ' takes ' + params.length + ' arguments, not ' + count);

  return params.map((schema, index) =>
    checked(args[index], schema, name + ' argument ' + (index + 1)),
  );
}

function unavailable(name: string): Error {
  return new Error(
    name +
      ' cannot run: native modules are unavailable on this host. ' +
      'They run in the iOS and Android shells (`kuito dev ios`).',
  );
}

/**
 * The function a stub binds to `id`: `js` returns the platform's result, and
 * `main` or `background` a Promise of it.
 */
export function link(
  id: unknown,
  name: unknown,
  thread: unknown,
  params: unknown,
  direct?: unknown,
): unknown {
  if (
    typeof id !== 'number' ||
    typeof name !== 'string' ||
    (thread !== 'js' && thread !== 'main' && thread !== 'background') ||
    !Array.isArray(params)
  )
    throw new TypeError('Invalid module function stub');

  const schemas: Schema[] = params;

  linked.names[String(id)] = name;

  if (thread === 'js')
    return (...args: unknown[]) => {
      const call = host.__kuitoHostCall;

      if (!isFunction(call)) throw unavailable(name);

      return call(id, ...argumentsOf(name, schemas, args));
    };

  const queued = (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const start = host.__kuitoHostCallAsync;

      if (!isFunction(start)) throw unavailable(name);

      const crossing = argumentsOf(name, schemas, args);
      const call = ++counters.moduleCall;

      moduleCalls[call] = { subject: name, resolve, reject };

      try {
        start(id, call, ...crossing);
      } catch (error) {
        delete moduleCalls[call];
        reject(error);
      }
    });

  // A main-thread function that answers at once, which UI-thread code calls directly.
  if (direct === true) linked.direct.set(queued, id);

  return queued;
}

function observe(name: string, id: number, observing: boolean): void {
  const observeHost = host.__kuitoHostObserve;

  if (!isFunction(observeHost)) throw unavailable(name);

  observeHost(id, observing);
}

function checkedId(id: unknown, name: unknown, what: string): asserts id is number {
  if (typeof id !== 'number' || typeof name !== 'string')
    throw new TypeError('Invalid module ' + what + ' stub');
}

/**
 * An event a stub binds to `id`: the platform sends it from the first
 * listener's `addListener` until the last one's `remove`.
 */
export function linkEvent(id: unknown, name: unknown): object {
  checkedId(id, name, 'event');

  const label = String(name);
  const listeners: { listener: (payload: unknown) => void }[] = [];
  const key = String(id);

  linked.names[key] = label;

  return {
    addListener(listener: unknown) {
      if (!isFunction(listener)) throw new TypeError(label + '.addListener requires a function');

      const entry = { listener };

      listeners.push(entry);

      if (listeners.length === 1) {
        linked.receivers[key] = (payload) =>
          listeners.slice().forEach((each) => {
            try {
              each.listener(payload);
            } catch (error) {
              reportError(label + ' listener threw', error);
            }
          });

        observe(label, id, true);
      }

      return {
        remove() {
          const index = listeners.indexOf(entry);

          if (index === -1) return;

          listeners.splice(index, 1);

          if (listeners.length > 0) return;

          delete linked.receivers[key];
          observe(label, id, false);
        },
      };
    },
  };
}

/**
 * A live value a stub binds to `id`: a read-only signal that asks the
 * platform on each read while unwatched, and follows what it sends while
 * watched.
 */
export function linkLive(id: unknown, name: unknown): object {
  checkedId(id, name, 'live value');

  const label = String(name);
  const key = String(id);

  linked.names[key] = label;

  // A record read again is the same object while its data stays, so what
  // follows it sees no change; each read crosses as a new one.
  let last: unknown = undefined;
  const same = (next: unknown): unknown => {
    if (!sameData(last, next)) last = next;

    return last;
  };

  return createSource(
    () => {
      const call = host.__kuitoHostCall;

      if (!isFunction(call)) throw unavailable(label);

      return same(call(id));
    },
    (set) => {
      linked.receivers[key] = (value) => set(same(value));
      observe(label, id, true);

      return () => {
        delete linked.receivers[key];
        observe(label, id, false);
      };
    },
  );
}

/**
 * A motion value a stub binds to `id` (`motion<T>()` in a spec): null until
 * the platform sets it. Once the app first reads or binds it, the UI thread
 * holds it and the platform writes each change there on the main thread,
 * sending it here too for code that reads it on this thread.
 */
export function linkMotion(id: unknown, name: unknown): object {
  checkedId(id, name, 'motion value');

  const label = String(name);
  const key = String(id);
  const motion = platformMotion('l' + key, label, (record) => {
    queueOperation({ op: 'linked', id: record.id, value: null });

    observe(label, id, true);
  });

  linked.names[key] = label;
  linked.receivers[key] = (value) => motion.set(value);

  return motion.handle;
}

/** Module views cross the host boundary as `module:<Name>`, apart from built-in kinds. */
export const MODULE_KIND = 'module:';

/**
 * A view a stub binds to `id`: the kind JSX renders it as. The first plan of
 * it calls `id`, which registers the kind with the renderer; its methods are
 * linked functions whose first argument is the view's number. A view that
 * takes children lays them out inside it.
 */
export function linkView(
  id: unknown,
  name: unknown,
  events: unknown,
  methods: unknown,
  children: unknown = false,
): string {
  checkedId(id, name, 'view');

  if (
    typeof children !== 'boolean' ||
    !Array.isArray(events) ||
    !events.every((event) => typeof event === 'string') ||
    !isPlainData(methods) ||
    !Object.keys(methods).every((key) => isFunction(methods[key]))
  )
    throw new TypeError('Invalid module view stub');

  const kind = MODULE_KIND + String(name);

  linked.names[String(id)] = String(name) + '.view';

  linked.views[kind] = {
    id,
    registered: false,
    events: events as string[],
    methods: methods as Record<string, (...args: unknown[]) => unknown>,
    children,
  };

  return kind;
}

/** A linked view's events, registering its kind natively the first time. */
export function linkedViewEvents(kind: string): string[] | null {
  const view = own(linked.views, kind) ? linked.views[kind] : null;

  if (!view) return null;

  if (!view.registered) {
    const call = host.__kuitoHostCall;

    if (!isFunction(call)) throw unavailable(kind.slice(MODULE_KIND.length) + ' view');

    call(view.id);
    view.registered = true;
  }

  return view.events;
}

function pending(call: number) {
  const entry = moduleCalls[call];

  if (!entry) throw new Error('Native module call ' + call + ' is not pending');

  delete moduleCalls[call];

  return entry;
}

export function installLink(): void {
  // Sent after it stopped observing: nobody is listening.
  host.__kuitoLinkEmit = (id, value) => linked.receivers[String(id)]?.(value);
  host.__kuitoLinkSettle = (call, value) => pending(call).resolve(value);

  host.__kuitoLinkFail = (call, code, message) => {
    const entry = pending(call);

    entry.reject(moduleError(code, entry.subject + ' failed: ' + message));
  };

  host.__kuitoLinkError = (id, code, message) =>
    moduleError(
      code,
      (own(linked.names, String(id)) ? linked.names[String(id)] : 'Native function ' + id) +
        ' failed: ' +
        message,
    );
}

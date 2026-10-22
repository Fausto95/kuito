// A fake platform for a kernel installed with `installKernel`: it answers
// linked calls by id the way the iOS and Android link tables do, so app code
// built on a native module runs without a device.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../src/cli/config.ts';
import { catalogOf, specFile } from '../../src/dev/modules/catalog.ts';

/**
 * `Module.function` by id, as the compiler numbers Kuito's built-in specs
 * for an app with no modules of its own.
 */
export const linkedNames: ReadonlyMap<number, string> = (() => {
  const directory = join(ROOT, 'native/modules');
  const files = readdirSync(directory)
    .map((name) => specFile(join(directory, name)))
    .filter((file) => existsSync(file));
  const catalog = catalogOf(files.map((file) => ({ file, source: readFileSync(file, 'utf8') })));

  return new Map(
    catalog.members.map(({ id, module, member }) => [id, `${module.name}.${member.name}`]),
  );
})();

/** The id of a built-in's `Module.member`, if it has a spec. */
function linkedId(name: string): number | undefined {
  for (const [id, each] of linkedNames) if (each === name) return id;

  return undefined;
}

/** The module and function a linked id names. */
export function linkedFunction(id: number): [module: string, method: string] {
  const name = linkedNames.get(id);

  if (!name) throw new Error(`No built-in module function has id ${id}`);

  const [module, method] = name.split('.');

  return [module, method];
}

export type Thread = 'js' | 'main' | 'background';

export interface FakeModule {
  /** `run` returns the result, or throws `{ code, message }` to fail with that code. */
  functions: Record<string, { thread: Thread; run: (...args: unknown[]) => unknown }>;
  /** The events and methods of the view the module contributes; no view when absent. */
  view?: { events: string[]; functions?: string[] };
}

/** What the kernel installs for the host to call back. */
interface ModuleCallbacks {
  __kuitoLinkSettle(call: number, value: unknown): void;
  __kuitoLinkFail(call: number, code: string, message: string): void;
  __kuitoLinkError(id: number, code: string, message: string): Error;
  __kuitoLinkEmit(id: number, value: unknown): void;
}

/**
 * `value` as the platform receives it: plain data copied, and an
 * ArrayBuffer's bytes copied into a buffer of their own, as the C++ copies
 * one JavaScript made.
 */
function crossed(value: unknown): unknown {
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]')
    return new Uint8Array(new Uint8Array(value as ArrayBuffer)).buffer;

  // In this realm, as JSON would make it: the kernel runs in another.
  if (Array.isArray(value)) return Array.from(value as unknown[], crossed);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, field]) =>
      field === undefined ? [] : [[key, crossed(field)]],
    ),
  );
}

export function fakeModules(modules: Record<string, FakeModule>) {
  const loads: string[] = [];
  const calls: { module: string; method: string; args: unknown[] }[] = [];
  const queued: { module: string; method: string; args: unknown[] }[] = [];
  const observed: string[] = [];
  // Asynchronous calls by their call number.
  const pending = new Map<number, () => void>();
  let kernel: ModuleCallbacks | null = null;

  /** A linked call: its result, or the failure the native linker would send. */
  function linked(id: number, args: unknown[]) {
    const [module, method] = linkedFunction(id);
    const values = args.map(crossed);

    // A view's own id registers its kind.
    if (method === 'view' && modules[module]?.view) {
      loads.push(module);

      return { ok: true as const, value: null };
    }

    // A view's method: the platform runs it on the mounted view.
    if (modules[module]?.view?.functions?.includes(method)) {
      calls.push({ module, method, args: values });

      return { ok: true as const, value: null };
    }

    calls.push({ module, method, args: values });

    try {
      return { ok: true as const, value: modules[module].functions[method].run(...values) ?? null };
    } catch (error) {
      const { code = 'ERR_TEST', message = String(error) } =
        typeof error === 'object' && error !== null
          ? (error as { code?: string; message?: string })
          : {};

      return { ok: false as const, code, message };
    }
  }

  function callbacks(): ModuleCallbacks {
    if (!kernel) throw new Error('fakeModules: attach() the installed kernel first');

    return kernel;
  }

  const host = {
    __kuitoHostObserve(id: number, active: boolean) {
      observed.push(`${active ? 'start' : 'stop'} ${linkedFunction(id).join('.')}`);
    },
    __kuitoHostCall(id: number, ...args: unknown[]) {
      const result = linked(id, args);

      if (!result.ok) throw callbacks().__kuitoLinkError(id, result.code, result.message);

      return result.value;
    },
    __kuitoHostCallAsync(id: number, call: number, ...args: unknown[]) {
      const [module, method] = linkedFunction(id);
      // Copied at the call, as the C++ copies them: a later write in JavaScript is not seen.
      const sent = args.map(crossed);

      queued.push({ module, method, args: sent });

      pending.set(call, () => {
        const result = linked(id, sent);

        if (result.ok) callbacks().__kuitoLinkSettle(call, result.value);
        else callbacks().__kuitoLinkFail(call, result.code, result.message);
      });
    },
  };

  return {
    host,
    loads,
    /** Every call, with its arguments as the platform decoded them. */
    calls,
    /** Every asynchronous call as it was made, before `flush` runs it. */
    queued,
    observed,
    /** The kernel `installKernel` returned for a host spread from `host`. */
    attach(installed: object) {
      kernel = installed as ModuleCallbacks;
    },
    /** Whether asynchronous calls wait for `flush`. */
    get waiting() {
      return pending.size > 0;
    },
    /** Runs every queued asynchronous call and settles it. */
    flush() {
      for (const [key, run] of pending) {
        pending.delete(key);
        run();
      }
    },
    /** An event or a live value's change, as the platform sends it. */
    emit(module: string, event: string, payload: unknown) {
      const id = linkedId(`${module}.${event}`);

      if (id === undefined) throw new Error(`fakeModules: ${module}.${event} is not linked`);

      callbacks().__kuitoLinkEmit(id, payload);
    },
  };
}

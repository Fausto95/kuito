// Native modules for the headless host (docs/testing.md#native-modules): the
// calls a shell's link table answers, answered by the fakes a test gives, by
// the module specs' names. A function that returns nothing does nothing
// unless faked; one that returns a value, and a live value, must be faked or
// be one the platform reports itself (the window, the appearance).
import type { LinkedMember, ModuleCatalog } from '../dev/modules/catalog.ts';
import type { Screen } from './renderer.ts';

/** A module's fakes by member name: a function for a function, the value for a live value. */
export type ModuleFake = Readonly<Record<string, unknown>>;

export type ModuleFakes = Readonly<Record<string, ModuleFake>>;

/** A call the app made, with its arguments as the platform decoded them. */
export interface ModuleCall {
  module: string;
  name: string;
  args: unknown[];
}

/** What the kernel installs for the host to call back (src/runtime/link.ts). */
export interface LinkCallbacks {
  __kuitoLinkSettle(call: number, value: unknown): void;
  __kuitoLinkFail(call: number, code: string, message: string): void;
  __kuitoLinkError(id: number, code: string, message: string): Error;
  __kuitoLinkEmit(id: number, value: unknown): void;
}

/** What every shell reports itself, whatever modules the app links. */
function platformValues(screen: Screen): ModuleFakes {
  return {
    Window: {
      metrics: {
        width: screen.width,
        height: screen.height,
        insets: screen.insets,
        orientation: screen.width > screen.height ? 'landscape' : 'portrait',
      },
    },
    Appearance: { colorScheme: 'light', fontScale: 1 },
    AppState: { state: 'active' },
    Linking: { url: null },
    Splash: { visible: false, layout: () => null, getVariant: () => null },
    SystemUI: { statusBarHeight: () => screen.insets.top, statusBarHiddenAtLaunch: () => false },
  };
}

class Failure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** A thrown `{ code, message }`, as a fake fails a call with that code. */
function failureOf(error: unknown): Failure {
  if (error instanceof Failure) return error;

  const code =
    typeof error === 'object' && error !== null && typeof Reflect.get(error, 'code') === 'string'
      ? String(Reflect.get(error, 'code'))
      : 'ERR_NATIVE';
  const message = error instanceof Error ? error.message : String(error);

  return new Failure(code, message);
}

function call(fake: Function, args: unknown[]): unknown {
  const result: unknown = Reflect.apply(fake, undefined, args);

  return result;
}

const copy = (values: unknown[]): unknown[] => JSON.parse(JSON.stringify(values)) as unknown[];

export class FakeModules {
  /** Every call, in order. */
  readonly calls: ModuleCall[] = [];
  /** Asynchronous calls not settled yet: the host runs them on its next turn. */
  readonly pending: (() => Promise<void>)[] = [];
  private readonly catalog: ModuleCatalog;
  private fakes: ModuleFakes = {};
  private kernel: LinkCallbacks | null = null;

  constructor(catalog: ModuleCatalog) {
    this.catalog = catalog;
  }

  /** The fakes for the next render, over what the platform reports for `screen`. */
  use(fakes: ModuleFakes, screen: Screen): void {
    const platform = platformValues(screen);
    const names = new Set([...Object.keys(platform), ...Object.keys(fakes)]);

    this.fakes = Object.fromEntries(
      [...names].map((name) => [name, { ...platform[name], ...fakes[name] }]),
    );
  }

  attach(kernel: LinkCallbacks): void {
    this.kernel = kernel;
  }

  private member(id: number): LinkedMember {
    const member = this.catalog.members[id - 1];

    if (!member) throw new Error(`No native module function has id ${id}`);

    return member;
  }

  private callbacks(): LinkCallbacks {
    if (!this.kernel) throw new Error('The kernel is not installed');

    return this.kernel;
  }

  /** The member's answer, or the failure a shell without it would send. */
  private run(id: number, args: unknown[]): unknown {
    const { module, member, view } = this.member(id);
    const name = member.name;
    const values = copy(args);
    const fake = this.fakes[module.name]?.[name];

    this.calls.push({ module: module.name, name, args: values });

    if (member.kind === 'live') {
      if (fake === undefined) throw this.missing(module.name, name);

      return typeof fake === 'function' ? call(fake, []) : fake;
    }

    // A view's own id registers its kind: the platform has every view it links.
    if (member.kind === 'view') return null;

    if (typeof fake === 'function') return call(fake, values) ?? null;
    if (fake !== undefined) return fake;
    if (view || member.kind !== 'function' || member.result === null) return null;

    throw this.missing(module.name, name);
  }

  private missing(module: string, name: string): Failure {
    return new Failure(
      'ERR_FUNCTION_NOT_FOUND',
      `${module}.${name} has no fake in this test: pass render(..., { modules: { ${module}: { ${name} } } }) (docs/testing.md#native-modules)`,
    );
  }

  /** The host's globals for linked calls, as native/shared/LinkJSI.h installs them. */
  host() {
    return {
      __kuitoHostCall: (id: number, ...args: unknown[]) => {
        try {
          return this.run(id, args);
        } catch (error) {
          const failure = failureOf(error);

          throw this.callbacks().__kuitoLinkError(id, failure.code, failure.message);
        }
      },
      __kuitoHostCallAsync: (id: number, call: number, ...args: unknown[]) => {
        this.pending.push(async () => {
          try {
            this.callbacks().__kuitoLinkSettle(call, await this.run(id, args));
          } catch (error) {
            const failure = failureOf(error);

            this.callbacks().__kuitoLinkFail(call, failure.code, failure.message);
          }
        });
      },
      __kuitoHostObserve: () => {},
    };
  }

  /** An event or a live value's change, as the platform sends it. */
  emit(module: string, name: string, value: unknown): void {
    const member = this.catalog.members.find(
      (each) => each.module.name === module && each.member.name === name,
    );

    if (!member)
      throw new Error(`${module}.${name} is not an event or live value of a linked module`);

    this.callbacks().__kuitoLinkEmit(member.id, value);
  }
}

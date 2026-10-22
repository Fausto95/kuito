// The headless host: what a shell gives the app's runtime, without a device.
// The kernel (src/runtime) and, once the app needs it, the UI-thread kernel
// run in node:vm contexts; their batches go through the shells' decoding and
// checks into the headless renderer, and native events come back through the
// path a shell's emitter takes: the UI thread first, then the kernel.
// Time is virtual: timers and frames run as the test advances it.
import { createContext, runInContext, type Context } from 'node:vm';
import { randomFillSync } from 'node:crypto';
import { bundleKernel, bundleUIKernel, uiKernelHash } from '../dev/kernel.ts';
import type { ModuleCatalog } from '../dev/modules/catalog.ts';
import { decodeBatch, type Mutation, type PropValue } from './batch.ts';
import type { Counts } from './cost.ts';
import { eventLayout, writeRecord } from './events.ts';
import { DEFAULT_FONTS, type FontTable } from './fonts.ts';
import { FakeModules, type LinkCallbacks, type ModuleFake, type ModuleFakes } from './modules.ts';
import { HeadlessRenderer, IPHONE_18_PRO, type Screen } from './renderer.ts';

interface Kernels {
  kernel: string;
  ui: string;
}

let bundled: Promise<Kernels> | null = null;

/**
 * Both kernels from one build, as a shell ships them, bundled once per
 * process. The UI kernel stays source: a shell ships it as bytecode, which
 * only Hermes runs, and checks the same hash.
 */
const kernels = () =>
  (bundled ??= bundleUIKernel().then(async (ui) => ({
    kernel: await bundleKernel('dev', ui),
    ui,
  })));

/** A request the app's `fetch` sent, as the test's handler receives it. */
export interface FetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** A text body as sent; null without one, or for one in bytes or a file. */
  body: string | null;
}

/** The handler's answer; a 200 with no body by default. */
export interface FetchAnswer {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

/**
 * Answers the app's requests. Plain data both ways: the app's realm has
 * Kuito's own `fetch`, not Node's `Request` and `Response`.
 */
export type FetchHandler = (request: FetchRequest) => FetchAnswer | Promise<FetchAnswer>;

export interface HostOptions {
  catalog: ModuleCatalog;
  fonts?: FontTable;
  screen?: Screen;
}

/** What each render configures: the platform the app sees until the next one. */
export interface RenderOptions {
  fonts?: FontTable;
  screen?: Screen;
  modules?: ModuleFakes;
  /** Answers the app's requests; without it, a request fails. */
  fetch?: FetchHandler;
}

/** A log line the app or the runtime wrote. */
export interface LogEntry {
  level: string;
  message: string;
}

interface Timer {
  due: number;
  callback: () => void;
}

/**
 * JSON each runtime made and parsed to cross a boundary since the host
 * started, and the display frames `advance` ran meanwhile
 * (docs/performance.md#json-at-the-boundary). `renderer` counts the JSON
 * prop values the batches carried, which a device's renderer parses.
 */
export interface WireWork {
  frames: number;
  /** The kernel's: the UI kernel makes none. */
  bytesStringified: number;
  jsonParses: { kernel: number; ui: number; renderer: number };
}

/** The kernel's globals the host calls, once installed. */
interface Kernel extends LinkCallbacks {
  __kuito: {
    readonly work: { readonly jsonParses: number; readonly bytesStringified: number };
    readonly eventNumbers: Float64Array;
    dispatch(handle: number, type: string, payload?: string | Record<string, unknown>): unknown;
    dispatchRecord(handle: number, type: string, layout: number, strings?: string[]): unknown;
    patch(unit: string, register: (api: { render(tree: unknown): void }) => void): void;
    dispose(unit: string): boolean;
    defineChunk(name: string, factory: (...args: unknown[]) => void): void;
  };
  __kuitoHttpHead(id: number, status: number, url: string, headers: string[]): void;
  __kuitoHttpEnd(id: number, body: ArrayBuffer, error: string): void;
}

interface UIKernel {
  readonly work: { readonly jsonParses: number };
  readonly eventNumbers: Float64Array;
  receive(operations: unknown[]): void;
  event(handle: number, type: string, payload: string): boolean;
  eventRecord(handle: number, type: string, layout: number, strings?: string[]): boolean;
  frame(now: number): void;
}

const isKernel = (context: object): context is Context & Kernel =>
  '__kuito' in context && '__kuitoLinkSettle' in context && '__kuitoHttpEnd' in context;

const isUIKernel = (value: unknown): value is UIKernel =>
  typeof value === 'object' && value !== null && 'receive' in value && 'event' in value;

const FRAME = 1000 / 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** A UI-thread prop write's value, typed as the UI runtime types one (UIRuntime.cpp). */
function uiValue(value: unknown): PropValue {
  if (value === null || value === undefined) return { type: 'null', value: null };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (typeof value === 'string') return { type: 'text', value };

  return { type: 'struct', value: structuredClone(value) };
}

/**
 * The direction a shell starts the app in, from the faked first language as
 * a device's own: right to left only for a language that writes that way.
 */
function firstLanguageDirection(localization: ModuleFake | undefined): 'ltr' | 'rtl' {
  const locales = localization?.locales;
  const first: unknown = Array.isArray(locales) ? locales[0] : undefined;

  return typeof first === 'object' &&
    first !== null &&
    'textDirection' in first &&
    first.textDirection === 'rtl'
    ? 'rtl'
    : 'ltr';
}

export class HeadlessHost {
  readonly renderer: HeadlessRenderer;
  readonly modules: FakeModules;
  /** Every mutation the batches carried since the last render, in order. */
  readonly mutations: Mutation[] = [];
  readonly logs: LogEntry[] = [];
  /** What the host's turns caught: a batch a shell would reject, an event that threw. */
  private readonly errors: unknown[] = [];
  private readonly context: Context & Kernel;
  /** The UI kernel this host ships, run the first time the kernel asks for it. */
  private readonly uiKernel: string;
  private ui: { kernel: UIKernel; context: Context } | null = null;
  private readonly timers = new Map<number, Timer>();
  private readonly events: (() => void)[] = [];
  private readonly requests = new Set<Promise<void>>();
  private readonly externals = new Map<string, unknown>();
  /** Each motion value as the UI thread last mirrored it (native/shared/MotionMirror.h). */
  private readonly mirror = new Map<string, { value: unknown; js: number }>();
  private fetchHandler: FetchHandler | null = null;
  private frameRequested = false;
  /** UI-thread messages arrived since its last frame, which applies them. */
  private uiReceived = false;
  private now = 0;
  private renders = 0;
  private frames = 0;
  private rendererParses = 0;
  private recordsApplied = 0;
  private uiEntries = 0;
  private wastedUiEntries = 0;

  static async create(options: HostOptions): Promise<HeadlessHost> {
    return new HeadlessHost(options, await kernels());
  }

  private constructor(
    { catalog, fonts = DEFAULT_FONTS, screen = IPHONE_18_PRO }: HostOptions,
    { kernel, ui }: Kernels,
  ) {
    this.uiKernel = ui;

    this.renderer = new HeadlessRenderer(fonts, {
      // A list binds rows during a frame; the kernel hears of it after.
      emit: (id, event, payload) => this.events.push(() => this.dispatch(id, event, payload)),
    });

    this.renderer.screen = screen;
    this.modules = new FakeModules(catalog);
    this.modules.use({}, screen);

    const context = createContext({
      ...this.globals(),
      ...this.modules.host(),
    });

    runInContext(kernel, context, { filename: 'kuito://kernel' });

    if (!isKernel(context)) throw new Error('The Kuito kernel did not install itself');

    this.context = context;
    this.modules.attach(context);
  }

  /** Modules a test bundle requires that are not its own chunks: `kuito/tests`, `node:*`. */
  provide(name: string, exports: unknown): void {
    this.externals.set(name, exports);
  }

  private globals() {
    return {
      // A batch a shell rejects fails the job that sent it, and the test.
      __kuitoHostCommit: (buffer: ArrayBuffer, length: number, strings: string[]) => {
        try {
          this.commit(decodeBatch(this.renderer.engine.native, buffer, length, strings));
        } catch (error) {
          this.errors.push(error);
          throw error;
        }
      },
      __kuitoHostSetTimer: (id: number, delay: number, callback: () => void) =>
        this.timers.set(id, { due: this.now + Math.max(delay, 0), callback }),
      __kuitoHostClearTimer: (id: number) => this.timers.delete(id),
      __kuitoHostNow: () => this.now,
      __kuitoHostEncodeUtf8: (text: string) => toBuffer(encoder.encode(text)),
      __kuitoHostDecodeUtf8: (buffer: ArrayBuffer, offset: number, length: number) =>
        decoder.decode(new Uint8Array(buffer, offset, length)),
      __kuitoHostFillRandom: (buffer: ArrayBuffer, offset: number, length: number) => {
        randomFillSync(new Uint8Array(buffer, offset, length));
      },
      __kuitoHostLog: (level: string, message: string) => {
        this.logs.push({ level, message });

        (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(
          message,
        );
      },
      __kuitoHostMotionRead: (id: string) => {
        const entry = this.mirror.get(id);

        return entry && { value: structuredClone(entry.value), js: entry.js };
      },
      __kuitoHostLoad: (name: string) => {
        if (!this.externals.has(name)) return;

        const exports = this.externals.get(name);

        this.context.__kuito.defineChunk(name, (_require: unknown, module: unknown) => {
          Reflect.set(Object(module), 'exports', exports);
        });
      },
      __kuitoHostHttp: {
        start: (
          id: number,
          request: { url: string; method: string; headers: string[] },
          body: unknown,
        ) => this.request(id, request, body),
        stream() {},
        cancel() {},
      },
    };
  }

  // MARK: - The app

  /**
   * Evaluates an app bundle as a shell's runtime evaluates its first
   * revision. A bundle that evaluates to a function is called with `args`.
   */
  evaluate(code: string, filename = 'kuito://app', ...args: unknown[]): void {
    this.guard(() => {
      const result: unknown = runInContext(code, this.context, { filename });

      if (typeof result === 'function') Reflect.apply(result, undefined, args);
    });

    this.throwErrors();
  }

  /**
   * Renders `tree` as the app's root, after the previous render's root is
   * gone: each render starts from no views, with its own platform.
   */
  render(tree: unknown, options: RenderOptions = {}): void {
    const unit = `kuito.tests.${this.renders}`;

    if (this.renders > 0)
      this.guard(() => this.context.__kuito.dispose(`kuito.tests.${this.renders - 1}`));

    this.renders++;
    this.configure(options);
    this.mutations.length = 0;
    this.guard(() => this.context.__kuito.patch(unit, (api) => api.render(tree)));
  }

  configure({ fonts, screen, modules = {}, fetch }: RenderOptions): void {
    if (fonts) this.renderer.fonts = fonts;
    if (screen) this.renderer.screen = screen;
    this.modules.use(modules, this.renderer.screen);
    this.renderer.direction = firstLanguageDirection(modules.Localization);
    this.fetchHandler = fetch ?? null;
  }

  // MARK: - Batches and events

  /** A batch in its order, as a shell applies it: a UI-thread record sees the views before it. */
  private commit(mutations: Mutation[]): void {
    let views: Mutation[] = [];

    this.mutations.push(...mutations);
    this.recordsApplied += mutations.length;

    for (const m of mutations) {
      if (m.op === 'prop' && m.type === 'json') this.rendererParses++;

      if (m.op !== 'ui' && m.op !== 'uiScript' && m.op !== 'uiKernel' && m.op !== 'uiBundle') {
        views.push(m);
        continue;
      }

      if (views.length) this.renderer.apply(views);
      views = [];
      this.uiReceived = true;

      if (m.op === 'uiKernel') this.loadUIKernel(m.hash);
      else if (m.op === 'uiScript') this.loadUI(m.source, m.url);
      else if (m.op === 'uiBundle')
        throw new Error(
          `The UI bundle ${m.url} is one a release shell ships as bytecode: the headless host runs UI bundles from source`,
        );
      else if (this.ui) {
        this.uiEntries++;
        this.ui.kernel.receive(m.operations);
      }
    }

    if (views.length) this.renderer.apply(views);
  }

  /** As native/shared/UIKernel.h checks ui.hbc: only the UI kernel built with the kernel runs. */
  private loadUIKernel(hash: string): void {
    const shipped = uiKernelHash(this.uiKernel);

    if (shipped !== hash)
      throw new Error(
        `The UI kernel is ${shipped}, but the kernel was built with UI kernel ${hash}: both come from one build`,
      );

    const context = createContext({
      __kuitoUISetProp: (view: number, prop: string, value: unknown) => {
        if (!this.renderer.views.has(view)) return;

        this.recordsApplied++;
        this.renderer.setProp(this.renderer.view(view), prop, uiValue(value));
        this.renderer.layout();
      },
      // Each runtime gets a copy, as C++ copies plain data between the threads.
      __kuitoUISendEvent: (message: Record<string, unknown>) => {
        const copy = structuredClone(message);

        this.events.push(() => this.guard(() => this.context.__kuito.dispatch(0, 'ui', copy)));
      },
      __kuitoUIMirror: (id: string, value: unknown, js: number) =>
        this.mirror.set(id, { value: structuredClone(value), js }),
      __kuitoUIMirrorNumber: (id: string, value: number, js: number) =>
        this.mirror.set(id, { value, js }),
      __kuitoUILog: (level: string, message: string) => this.logs.push({ level, message }),
      __kuitoUIRequestFrame: () => {
        this.frameRequested = true;
      },
      // Stopped: a test host's speed says nothing of a device's frame budget.
      __kuitoUINow: () => 0,
      __kuitoUIHostCall: (id: number, ...args: unknown[]) =>
        this.modules.host().__kuitoHostCall(id, ...args),
    });

    runInContext(this.uiKernel, context, { filename: 'kuito://ui-kernel' });

    const ui: unknown = runInContext('globalThis.__kuitoUI', context);

    if (!isUIKernel(ui)) throw new Error('The UI-thread kernel did not install __kuitoUI');

    this.ui = { kernel: ui, context };
  }

  /** A revision of the app's UI bundle, which runs on the UI kernel. */
  private loadUI(source: string, url: string): void {
    if (!this.ui) throw new Error(`The UI bundle ${url} arrived before the UI kernel`);

    runInContext(source, this.ui.context, { filename: url });
  }

  /**
   * A native event as a shell's emitter sends it: a UI-thread handler first,
   * then the kernel. Its payload goes in the typed record the manifest lays
   * out for the view's kind (docs/events.md#typed-events), written into each
   * kernel's buffer as native writes it; a module view's goes as JSON.
   * True when a UI-thread handler took it.
   */
  dispatch(id: number, event: string, payload: Readonly<Record<string, unknown>> = {}): boolean {
    let onUI = false;

    this.guard(() => {
      const kind = id === 0 ? null : (this.renderer.views.get(id)?.kind ?? null);
      const layout = id !== 0 && kind === null ? null : eventLayout(kind, event);

      if (layout === null) {
        if (kind !== null && !kind.startsWith('module:'))
          throw new Error(`${kind} sends no ${event} event in src/protocol/manifest.ts`);

        const json = Object.keys(payload).length ? JSON.stringify(payload) : undefined;

        onUI = id !== 0 && this.uiEvent(() => this.ui?.kernel.event(id, event, json ?? ''));

        if (!onUI) this.context.__kuito.dispatch(id, event, json);

        return;
      }

      const ui = this.ui?.kernel;

      // The app's events reach the UI thread first too, as on a device: the keyboard's moves stop there.
      onUI =
        ui !== undefined &&
        this.uiEvent(() =>
          ui.eventRecord(id, event, layout, writeRecord(layout, payload, ui.eventNumbers)),
        );

      if (onUI) return;

      const kernel = this.context.__kuito;

      kernel.dispatchRecord(id, event, layout, writeRecord(layout, payload, kernel.eventNumbers));
    });

    return onUI;
  }

  /** An event the UI-thread kernel is offered: true when a handler took it. */
  private uiEvent(offer: () => boolean | undefined): boolean {
    if (!this.ui) return false;

    this.uiEntries++;

    const taken = offer() === true;

    if (!taken) this.wastedUiEntries++;

    return taken;
  }

  /** The cost counters since the host started (docs/performance.md#cost-counters). */
  counts(): Counts {
    const { nodesLaidOut, measureCalls, wastedMeasures, nodesFramed, wastedFrames } =
      this.renderer.engine.cost();

    return {
      ...this.renderer.counts,
      recordsApplied: this.recordsApplied,
      nodesLaidOut,
      nodesFramed,
      wastedFrames,
      measureCalls,
      wastedMeasures,
      uiEntries: this.uiEntries,
      wastedUiEntries: this.wastedUiEntries,
    };
  }

  wireWork(): WireWork {
    return {
      frames: this.frames,
      bytesStringified: this.context.__kuito.work.bytesStringified,
      jsonParses: {
        kernel: this.context.__kuito.work.jsonParses,
        ui: this.ui?.kernel.work.jsonParses ?? 0,
        renderer: this.rendererParses,
      },
    };
  }

  emit(module: string, name: string, value: unknown): void {
    this.guard(() => this.modules.emit(module, name, value));
  }

  private guard(run: () => unknown): void {
    try {
      run();
    } catch (error) {
      this.errors.push(error);
    }
  }

  // MARK: - Network

  private request(
    id: number,
    sent: { url: string; method: string; headers: string[] },
    body: unknown,
  ): void {
    const headers: Record<string, string> = {};

    for (let at = 0; at < sent.headers.length; at += 2)
      headers[sent.headers[at].toLowerCase()] = sent.headers[at + 1];

    const handler = this.fetchHandler;
    const answer = (async () => {
      if (!handler)
        throw new Error(
          `${sent.method} ${sent.url}: this test answers no requests; pass render(..., { fetch })`,
        );

      const request = this.adopt({
        url: sent.url,
        method: sent.method,
        headers,
        body: typeof body === 'string' ? body : null,
      });
      const { status = 200, headers: answered = {}, body: content = '' } = await handler(request);
      const bytes = typeof content === 'string' ? encoder.encode(content) : content;

      this.guard(() => {
        this.context.__kuitoHttpHead(id, status, sent.url, Object.entries(answered).flat());
        this.context.__kuitoHttpEnd(id, toBuffer(bytes), '');
      });
    })().catch((error: unknown) =>
      this.guard(() => this.context.__kuitoHttpEnd(id, new ArrayBuffer(0), String(error))),
    );
    const tracked = answer.finally(() => this.requests.delete(tracked));

    this.requests.add(tracked);
  }

  /**
   * `value` as data of the app's realm, where the test's code runs: Node's
   * strict assertions compare prototypes, so data the host made would never
   * equal a literal the test wrote.
   */
  adopt<T>(value: T): T {
    const parse: unknown = runInContext('JSON.parse', this.context);

    if (typeof parse !== 'function') throw new Error('The kernel realm has no JSON.parse');

    return Reflect.apply(parse, undefined, [JSON.stringify(value)]) as never;
  }

  /** A list made in the app's realm, holding `items` as they are. */
  adoptList<T>(items: readonly T[]): T[] {
    const from: unknown = runInContext('Array.from', this.context);

    if (typeof from !== 'function') throw new Error('The kernel realm has no Array.from');

    return Reflect.apply(from, undefined, [items]) as never;
  }

  // MARK: - Time

  /**
   * Runs what is due now until nothing is left: native events, settled
   * module calls, answered requests, timers due at this time, and a UI
   * frame for what the UI thread was sent. An animation's next frames wait
   * for `advance`. Throws what the app threw meanwhile.
   */
  async settle(): Promise<void> {
    for (let turn = 0; turn < 1000; turn++) {
      await new Promise((done) => setImmediate(done));

      const work = this.events.length + this.modules.pending.length + this.requests.size;

      this.events.splice(0).forEach((event) => event());
      await Promise.all(this.modules.pending.splice(0).map((run) => run()));
      if (this.requests.size) await Promise.race(this.requests);

      const due = this.runTimers();
      const frame = this.uiReceived && this.ui !== null;

      if (frame) this.frame();

      this.throwErrors();

      if (work === 0 && !due && !frame) return;
    }

    throw new Error(
      'The app kept working through 1000 turns without settling: is a timer or a request looping?',
    );
  }

  private runTimers(): boolean {
    const due = [...this.timers]
      .filter(([, timer]) => timer.due <= this.now)
      .sort((a, b) => a[1].due - b[1].due);

    for (const [id, timer] of due) {
      this.timers.delete(id);
      this.guard(timer.callback);
    }

    return due.length > 0;
  }

  /** Moves virtual time on by `ms`, a display frame at a time: timers fire and animations step. */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;

    await this.settle();

    while (this.now < end) {
      this.now = Math.min(end, this.now + FRAME);
      this.frames++;

      if (this.frameRequested) this.frame();

      await this.settle();
    }
  }

  /** A display frame on the UI thread, at the virtual clock's time. */
  private frame(): void {
    this.frameRequested = false;
    this.uiReceived = false;
    if (this.ui) this.uiEntries++;
    this.guard(() => this.ui?.kernel.frame(this.now));
  }

  private throwErrors(): void {
    const [error] = this.errors.splice(0);

    if (error !== undefined) throw error;
  }
}

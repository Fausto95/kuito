// The kernel with a UI runtime, as a device hosts it: records the operations
// and scripts it sends to the UI runtime, the props it sets and its logs.
import { installKernel, type Component, type Props } from './kuito-host.ts';
import { hosting } from './host-wire.ts';

export interface Motion {
  value: unknown;
}

/** As the compiler emits it: each capture's path, then how the function uses it. */
type Tag = (fn: unknown, id: string, captures: () => unknown[], uses: string[][]) => unknown;

interface ThreadGlobals {
  __kuitoThread: Tag;
  __kuitoThreadRejected: (fn: unknown, reason: string) => unknown;
  __kuito: {
    useMotion(initial: unknown, name?: string): Motion;
    loadUI(code: string, url?: string): void;
    loadShippedUI(hash: string, url: string): void;
  };
}

const hasThreads = (host: object): host is ThreadGlobals =>
  '__kuitoThread' in host && '__kuitoThreadRejected' in host;

/** A kernel with a UI runtime: records UI operations, scripts, props and logs. */
export function make({ ui = true } = {}) {
  const operations: Array<Record<string, unknown>> = [];
  const scripts: string[] = [];
  /** The bundled UI kernels the kernel asked the host to load, by hash. */
  const kernels: string[] = [];
  /** The UI bundles the kernel asked the host to load from what it ships, by hash and url. */
  const bundles: Array<{ hash: string; url: string }> = [];
  const props: Array<[string, string, unknown]> = [];
  const logs: Array<[string, string]> = [];
  /** Each motion value as the UI thread last mirrored it, with the JS write it includes. */
  const mirror = new Map<string, { value: unknown; js: number }>();
  const reads = { whole: 0 };
  /** As native/shared/MotionMirror.h answers: a fresh number, null when stale, undefined otherwise. */
  const motionNumber = (id: string, version: number) => {
    const entry = mirror.get(id);

    if (!entry) return null;

    if (typeof entry.value !== 'number') return undefined;

    return entry.js >= version ? entry.value : null;
  };
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        props.push([id, name, value]);
      },
      removeView() {},
      __kuitoHostLog(level: string, message: string) {
        logs.push([level, message]);
      },
      ...(ui && {
        ui(sent: unknown[]) {
          operations.push(...(sent as Array<Record<string, unknown>>));
        },
        uiKernel(hash: string) {
          kernels.push(hash);
        },
        uiScript(_source: string, url: string) {
          scripts.push(url);
        },
        uiBundle(hash: string, url: string) {
          bundles.push({ hash, url });
        },
        __kuitoHostMotionRead: (id: string) => {
          reads.whole++;

          return mirror.get(id);
        },
        __kuitoHostMotionNumber: motionNumber,
      }),
    }),
  );

  if (!hasThreads(host)) throw new Error('The kernel did not install thread tags');

  const threads: ThreadGlobals = host;
  const render = (component: Component, props: Props = {}) =>
    host.__kuito.patch('app', (api) => api.render(host.__kuitoJSX(component, props)));
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const sent = (view: string, name: string) =>
    props.filter(([id, key]) => id === view && key === name).map(([, , value]) => value);
  const ops = (op: string) =>
    operations
      .filter((operation) => operation.op === op)
      .map((operation): Record<string, unknown> => JSON.parse(JSON.stringify(operation)));

  return {
    host,
    threads,
    operations,
    kernels,
    bundles,
    scripts,
    props,
    logs,
    mirror,
    reads,
    render,
    settle,
    sent,
    ops,
  };
}

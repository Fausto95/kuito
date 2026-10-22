// The channel to the UI-thread kernel (src/ui-thread). Operations queue during
// a JS job and go with the next host batch, after the view mutations they
// refer to (src/runtime/wire.ts); the UI runtime starts with the first ones.
import { followMotionPreference } from './accessibility';
import { wire } from './state/batch';
import { threads, type UIBundle } from './state/threads';
import type { PlainData } from './values';
import { sendBatch, writeUI, writeUIBundle, writeUIKernel, writeUIScript } from './wire';

/** The hash of the UI kernel built with this kernel; src/dev/kernel.ts defines it when bundling. */
declare const __KUITO_UI_KERNEL_HASH__: string;

/** A host with a UI runtime reads motion values from it. */
export function hasUIThread(): boolean {
  return typeof globalThis.__kuitoHostMotionRead === 'function';
}

/**
 * Queues `operation` for the next host batch. Outside a scope that sends one
 * (src/runtime/wire.ts), the operations of a task go together when it ends.
 */
export function queueOperation(operation: PlainData): void {
  if (!hasUIThread()) return;

  threads.queue.push(operation);

  if (wire.holding > 0 || threads.scheduled) return;

  threads.scheduled = true;

  void Promise.resolve().then(() => {
    threads.scheduled = false;
    sendBatch();
  });
}

/** What `appendOperations` wrote, for `operationsSent` once the host accepted it. */
export interface SentOperations {
  count: number;
  started: boolean;
  revision: number;
}

/**
 * Writes the queued operations into the batch: loading the host's UI kernel
 * first, then a new app bundle, then the operations. Nothing is marked sent until the host takes
 * the batch.
 */
export function appendOperations(): SentOperations | null {
  if (!threads.queue.length) return null;

  if (!threads.started) {
    writeUIKernel(__KUITO_UI_KERNEL_HASH__);
    // Animations honor the user's motion preference from the first frame:
    // asking for it rides this batch, which is still being written.
    wire.holding++;

    try {
      const preference = followMotionPreference();

      if (preference) threads.queue.unshift(preference);
    } finally {
      wire.holding--;
    }
  }

  const bundle = threads.bundle;
  const fresh = bundle.revision > threads.sentRevision;
  // The operations queued with a new bundle may still name an earlier
  // bundle's functions: they decode first, then the sweep drops those.
  const operations = fresh ? threads.queue.concat([{ op: 'sweep' }]) : threads.queue;

  if (fresh) {
    if ('hash' in bundle.ui) writeUIBundle(bundle.ui.hash, bundle.url);
    else writeUIScript(bundle.ui.source, bundle.url);
  }

  writeUI(operations);

  return { count: threads.queue.length, started: true, revision: bundle.revision };
}

export function operationsSent(sent: SentOperations | null): void {
  if (!sent) return;

  threads.queue.splice(0, sent.count);
  threads.started = sent.started;
  threads.sentRevision = sent.revision;
}

/** The bundle the next operations go after; the same bundle again is the same revision. */
function setUIBundle(ui: UIBundle, url: string | undefined): void {
  const current = threads.bundle.ui;
  const same =
    'hash' in ui
      ? 'hash' in current && current.hash === ui.hash
      : 'source' in current && current.source === ui.source;

  if (same) return;

  const revision = threads.bundle.revision + 1;

  threads.bundle = { ui, revision, url: url ?? 'kuito://ui/' + revision };
}

/**
 * The compiled app's UI-thread functions; sent before the next operations.
 * The compiler names the bundle by its content, which is how DevTools gets
 * its source from the dev server (docs/devtools.md).
 */
export function loadUIBundle(code: unknown, url?: unknown): void {
  if (typeof code !== 'string') throw new TypeError('Invalid UI bundle');
  if (url !== undefined && typeof url !== 'string') throw new TypeError('Invalid UI bundle URL');

  setUIBundle({ source: code }, url);
}

/**
 * A release build's UI-thread functions: the bytecode its shell ships beside
 * the app, named by the SHA-1 of its source, which the UI runtime checks
 * against the bytecode's header (native/shared/UIKernel.h).
 */
export function loadShippedUIBundle(hash: unknown, url: unknown): void {
  if (typeof hash !== 'string' || !/^[0-9a-f]{40}$/.test(hash))
    throw new TypeError(
      `A shipped UI bundle is named by the SHA-1 hash of its source, not ${String(hash)}`,
    );

  if (typeof url !== 'string') throw new TypeError('Invalid UI bundle URL');

  setUIBundle({ hash }, url);
}

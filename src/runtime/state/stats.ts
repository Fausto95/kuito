// The work the kernel counts, the JSON crossing the host boundary included.

/** Work counted for `__kuito.stats()` (src/runtime/devtools.ts). */
export interface KernelWork {
  /** Tracked expressions run: conditions, child expressions, computed props. */
  thunkEvaluations: number;
  subscriptionsCreated: number;
  subscriptionsDestroyed: number;
  sendPropCalls: number;
  /** Length of the JSON the kernel made to cross the host boundary. */
  bytesStringified: number;
  /** `__kuito.ui` messages from the UI thread: calls, signal writes, moved values. */
  uiMessages: number;
  /** JSON the kernel parsed from the host: a module view's event payloads. */
  jsonParses: number;
}

export function noWork(): KernelWork {
  return {
    thunkEvaluations: 0,
    subscriptionsCreated: 0,
    subscriptionsDestroyed: 0,
    sendPropCalls: 0,
    bytesStringified: 0,
    uiMessages: 0,
    jsonParses: 0,
  };
}

export const stats: { replans: number; total: KernelWork; lastReplan: KernelWork } = {
  /** patch() runs that committed, the first plan of each module included. */
  replans: 0,
  total: noWork(),
  /** What the last committed patch() did, from registration to commit. */
  lastReplan: noWork(),
};

/** `json`, counted as crossing the host boundary. */
export function boundaryJson(json: string): string {
  stats.total.bytesStringified += json.length;

  return json;
}

/** `json` parsed, counted as having crossed the host boundary into the kernel. */
export function parseBoundaryJson(json: string): unknown {
  stats.total.jsonParses++;

  return JSON.parse(json);
}

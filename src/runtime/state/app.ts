// The running app: its Router and its chunks.

/**
 * The app's one Router, as src/ui/navigation.tsx registers it: kept here
 * because a Live Patch evaluates the app's modules again while a Router whose
 * table did not change keeps its render, and navigate() runs in the new ones.
 */
export const navigation: { router: unknown } = { router: null };

/** A compiled chunk of the app: CommonJS, run once with its own module object. */
export type ChunkFactory = (
  require: (name: string) => unknown,
  module: { exports: unknown },
  exports: unknown,
) => void;

/** The running revision's chunks, by name, and the exports of those evaluated (src/runtime/chunks.ts). */
export const chunks = {
  factories: new Map<string, ChunkFactory>(),
  evaluated: new Map<string, { exports: unknown }>(),
};

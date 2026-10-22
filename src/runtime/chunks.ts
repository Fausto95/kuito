// The app's chunks (docs/navigation.md#route-modules): the compiler splits an
// app into CommonJS chunks, one per route plus the root and what they share.
// A chunk's script only defines it; it runs the first time something requires
// it. A Live Patch defines every chunk of its revision in one script; a
// release shell has each chunk's bytecode in its own file, which the host
// evaluates on the first require of a chunk not defined yet.
import { chunks, type ChunkFactory } from './state/app';

declare global {
  /** Evaluates the bytecode of the chunk `name`, which defines it. Release shells only. */
  var __kuitoHostLoad: ((name: string) => void) | undefined;
}

/** `./shared-ab12.js`, as a chunk's own `require` names another, is `shared-ab12`. */
const nameOf = (specifier: string) => specifier.replace(/^\.\//, '').replace(/\.js$/, '');

export function defineChunk(name: string, factory: ChunkFactory): void {
  chunks.factories.set(name, factory);
}

export function requireChunk(specifier: string): unknown {
  const name = nameOf(specifier);
  const done = chunks.evaluated.get(name);

  if (done) return done.exports;

  if (!chunks.factories.has(name)) globalThis.__kuitoHostLoad?.(name);

  const factory = chunks.factories.get(name);

  if (!factory) throw new Error('The app has no chunk named ' + name + ': rebuild the app');

  // Cached before it runs, as CommonJS does, so a cycle sees the exports so far.
  const module: { exports: unknown } = { exports: {} };

  chunks.evaluated.set(name, module);
  factory(requireChunk, module, module.exports);

  return module.exports;
}

/** A new revision of the app: its chunks replace the last one's, none evaluated yet. */
export function resetChunks(): void {
  chunks.factories.clear();
  chunks.evaluated.clear();
}

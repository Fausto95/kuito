import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import type { BundledAsset } from './assets.ts';
import type { Diagnostic } from './compiler.ts';
import type { ConsoleEntry, Patch } from './device-server.ts';
import type { NativeModuleUse } from './modules/catalog.ts';
import type { PlacementFile } from './transform.ts';

/**
 * File watcher + serialized compilation/delivery. A failed compile/patch never
 * replaces the working VM module; the next edit retries from the last good one.
 * Output identical to the last delivered build is not sent again. No network
 * port, no filesystem polling loop. `kuito dev` rebuilds the native shell when
 * a patch requires a module it lacks (`nativeModules`) or imports an image it
 * lacks (`assets`).
 */
interface Outcome {
  changed: string[];
  ms: number;
}

interface Patched extends Outcome {
  revision: number;
  path: string;
  nativeModules: NativeModuleUse[];
  /** The module functions it calls, by id, and the hash their ids are numbered under. */
  links: number[];
  linkHash: string;
  assets: BundledAsset[];
  /** How many devices the patch reached; each acks it on the host. */
  delivered: number;
  /** The build `start()` made, before any edit. */
  initial: boolean;
}

interface SessionEvents {
  patched: [event: Patched];
  unchanged: [outcome: Outcome];
  rejected: [error: unknown, outcome: Outcome];
  error: [error: Error];
  /** A compiler warning about the source, at its file and line. */
  console: [entry: ConsoleEntry];
  /** The placement report of each file whose report changed (docs/placement.md). */
  placement: [files: PlacementFile[]];
}

interface Compiled extends Patch {
  /** sha1 of `code`: equal output is the same revision. */
  hash: string;
  watched?: string[];
  directories?: string[];
  nativeModules?: NativeModuleUse[];
  links?: number[];
  linkHash?: string;
  assets?: BundledAsset[];
  warnings?: Diagnostic[];
  placement?: PlacementFile[];
}

interface SessionOptions {
  entry: string;
  compile: (entry: string) => Promise<Compiled>;
  /** Delivers a patch; resolves to how many devices it reached. */
  host: { patch(patch: Patch): { delivered: number } | Promise<{ delivered: number }> };
  debounceMs?: number;
  watchFiles?: boolean;
}

/** How many recent revisions keep the time of the edit behind them. */
const EDITS_KEPT = 16;

export class LiveSession extends EventEmitter<SessionEvents> {
  entry: string;
  compile: SessionOptions['compile'];
  host: SessionOptions['host'];
  debounceMs: number;
  watchFiles: boolean;
  watchers: Map<string, FSWatcher>;
  /** Directories where any file counts, e.g. a new route in an app directory. */
  trees: Map<string, FSWatcher>;
  filesByDir: Map<string, Set<string>>;
  timer: NodeJS.Timeout | null;
  running: boolean;
  dirty: boolean;
  stopped: boolean;
  /** The last revision the host received. */
  revision: number;
  changed: Set<string>;
  #delivered: string | null = null;
  /** When the first edit since the last build began was noticed. */
  #editedAt: number | null = null;
  /** Each recent revision's edit time, for the time from edit to device. */
  #edits = new Map<number, number>();
  /** Each file's placement report as last emitted. */
  #placement = new Map<string, string>();

  constructor({ entry, compile, host, debounceMs = 80, watchFiles = true }: SessionOptions) {
    super();
    this.entry = resolve(entry);
    this.compile = compile;
    this.host = host;
    this.debounceMs = debounceMs;
    this.watchFiles = watchFiles;
    this.watchers = new Map();
    this.trees = new Map();
    this.filesByDir = new Map();
    this.timer = null;
    this.running = false;
    this.dirty = false;
    this.stopped = false;
    this.revision = 0;
    this.changed = new Set();
  }

  async start() {
    this.#watch([this.entry]);
    await this.#rebuild(true);

    return this;
  }

  /** `file` (absolute) names the edit, reported with the patch outcome. */
  notify(file?: string) {
    if (this.stopped) return;
    this.#editedAt ??= performance.now();
    if (file) this.changed.add(file);
    clearTimeout(this.timer ?? undefined);

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.#rebuild();
    }, this.debounceMs);
  }

  #watch(paths: string[]) {
    if (!this.watchFiles) return;

    const desired = new Map<string, Set<string>>();

    for (const path of [this.entry, ...paths]) {
      const absolute = resolve(path);
      const dir = dirname(absolute);
      const files = desired.get(dir) ?? new Set<string>();

      desired.set(dir, files);
      files.add(basename(absolute));
    }

    for (const [dir, watcher] of this.watchers) {
      if (!desired.has(dir)) {
        watcher.close();
        this.watchers.delete(dir);
      }
    }

    this.filesByDir = desired;

    for (const dir of desired.keys()) {
      if (this.watchers.has(dir)) continue;

      const watcher = watch(dir, (_event, filename) => {
        if (!filename) this.notify();
        else if (this.filesByDir.get(dir)?.has(String(filename)))
          this.notify(join(dir, String(filename)));
      });

      watcher.on('error', (error) => this.emit('error', error));
      this.watchers.set(dir, watcher);
    }
  }

  #watchTrees(directories: string[]) {
    if (!this.watchFiles) return;

    const desired = new Set(directories.map((dir) => resolve(dir)));

    for (const [dir, watcher] of this.trees) {
      if (!desired.has(dir)) {
        watcher.close();
        this.trees.delete(dir);
      }
    }

    for (const dir of desired) {
      if (this.trees.has(dir)) continue;

      const watcher = watch(dir, { recursive: true }, (_event, filename) =>
        this.notify(filename ? join(dir, String(filename)) : undefined),
      );

      watcher.on('error', (error) => this.emit('error', error));
      this.trees.set(dir, watcher);
    }
  }

  /** Milliseconds since the edit behind `revision`; undefined for a build no edit caused. */
  sinceEdit(revision: number): number | undefined {
    const at = this.#edits.get(revision);

    return at === undefined ? undefined : performance.now() - at;
  }

  async #rebuild(initial = false) {
    if (this.stopped) return;

    if (this.running) {
      this.dirty = true;
      return;
    }

    this.running = true;

    const changed = [...this.changed];
    const editedAt = this.#editedAt;

    this.changed.clear();
    this.#editedAt = null;

    const started = performance.now();
    const outcome = () => ({ changed, ms: Math.round(performance.now() - started) });

    try {
      const result = await this.compile(this.entry);

      if (this.stopped) return;

      this.#watch(result.watched ?? []);
      this.#watchTrees(result.directories ?? []);

      if (result.hash === this.#delivered) return void this.emit('unchanged', outcome());

      const { delivered } = await this.host.patch(result);

      if (this.stopped) return;
      this.#delivered = result.hash;
      this.revision = result.revision;
      if (editedAt !== null) this.#remember(result.revision, editedAt);

      (result.warnings ?? []).forEach(({ message, file, line, column }) =>
        this.emit('console', { level: 'warn', message, file, line, column }),
      );

      this.#reportPlacement(result.placement ?? []);

      this.emit('patched', {
        revision: result.revision,
        path: result.path,
        nativeModules: result.nativeModules ?? [],
        links: result.links ?? [],
        linkHash: result.linkHash ?? '',
        assets: result.assets ?? [],
        delivered,
        initial,
        ...outcome(),
      });
    } catch (error) {
      if (!this.stopped) this.emit('rejected', error, outcome());
    } finally {
      this.running = false;

      if (this.dirty && !this.stopped) {
        this.dirty = false;
        void this.#rebuild();
      }
    }
  }

  #reportPlacement(files: PlacementFile[]) {
    const changed = files.filter(({ file, entries }) => {
      const text = JSON.stringify(entries);

      if (this.#placement.get(file) === text) return false;

      this.#placement.set(file, text);

      return true;
    });

    if (changed.length) this.emit('placement', changed);
  }

  #remember(revision: number, editedAt: number) {
    this.#edits.set(revision, editedAt);

    for (const old of this.#edits.keys()) {
      if (this.#edits.size <= EDITS_KEPT) break;
      this.#edits.delete(old);
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer ?? undefined);
    for (const watcher of [...this.watchers.values(), ...this.trees.values()]) watcher.close();
    this.watchers.clear();
    this.trees.clear();
  }
}

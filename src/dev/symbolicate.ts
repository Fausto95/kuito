// Stacks from the device, mapped back to source. Each Live Patch bundle has a
// source map; a frame's `kuito://patch/N` URL names the bundle that ran it.
// A frame at a file's place relative to the project is already source: the
// UI-thread budget's reports name app code by its place (docs/placement.md).
// A debug shell names the bytecode it ships by the script it was compiled
// from, an absolute path whose map the CLI writes beside it.

import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  TraceMap,
  originalPositionFor,
  sourceContentFor,
  type SourceMapInput,
} from '@jridgewell/trace-mapping';
import { codeFrame } from './source-location.ts';
import { projectFile } from './project-file.ts';

/** One stack line as the engine printed it; `line` and `column` are 1-based. */
export interface StackFrame {
  name: string;
  url: string;
  line?: number;
  column?: number;
}

/** App code, Kuito itself, a dependency, or engine built-ins. */
export type FrameKind = 'app' | 'kuito' | 'library' | 'native';

export interface SourceFrame {
  name: string;
  kind: FrameKind;
  /** Relative to the project root when inside it. */
  file?: string;
  line?: number;
  column?: number;
}

export interface CodeFrame {
  file: string;
  line: number;
  column: number;
  frame: string;
}

export interface Symbolicated {
  frames: SourceFrame[];
  codeFrame?: CodeFrame;
}

const KERNEL_URL = 'kuito://bootstrap';
const KUITO_SOURCES = resolve(import.meta.dirname, '..') + sep;
const LOCATION = /^(.*):(\d+):(\d+)$/;
// Hermes and V8: `at name (location)` or `at location`; JSC: `name@location`.
const V8_FRAME = /^\s*at (?:async )?(.*)$/;
const NAMED_LOCATION = /^(.*?) \((?:address at )?(.*)\)$/;
const JSC_FRAME = /^([^@\s]*)@(.*:\d+:\d+)$/;

function frameAt(name: string, location: string): StackFrame {
  const match = LOCATION.exec(location);

  if (!match) return { name, url: location };

  return { name, url: match[1] ?? '', line: Number(match[2]), column: Number(match[3]) };
}

function parseLine(text: string): StackFrame | null {
  const v8 = V8_FRAME.exec(text);

  if (v8) {
    const body = v8[1] ?? '';
    const named = NAMED_LOCATION.exec(body);

    return named ? frameAt(named[1] ?? '', named[2] ?? '') : frameAt('', body);
  }

  const jsc = JSC_FRAME.exec(text.trim());

  return jsc ? frameAt(jsc[1] ?? '', jsc[2] ?? '') : null;
}

/** The frames of a stack; message lines, however many, are skipped. */
export function parseStack(stack: string): StackFrame[] {
  return stack.split('\n').flatMap((text) => parseLine(text) ?? []);
}

/** Who wrote `file`, an absolute path: the app, Kuito itself or a dependency. */
export function kindOf(file: string): FrameKind {
  if (file.startsWith(KUITO_SOURCES) || file.includes(`${sep}@kuito${sep}ui${sep}`)) return 'kuito';

  return file.includes(`${sep}node_modules${sep}`) ? 'library' : 'app';
}

interface Bundle {
  trace: TraceMap;
  map: string;
  directory: string;
}

interface Mapped {
  frame: SourceFrame;
  source?: () => string | null;
}

export class Symbolicator {
  #root: string;
  #keep: number;
  #bundles = new Map<string, Bundle>();
  /** Maps read from beside a script, by its path; a rebuild rewrites them. */
  #beside = new Map<string, { modified: number; bundle: Bundle }>();

  /** `root` is the project the display paths are relative to. */
  constructor({ root, keep = 8 }: { root: string; keep?: number }) {
    this.#root = root;
    this.#keep = keep;
  }

  /** The map of the bundle evaluated as `url`; sources resolve from `directory`. */
  remember(url: string, map: SourceMapInput, directory: string) {
    this.#bundles.delete(url);

    this.#bundles.set(url, {
      trace: new TraceMap(map),
      map: typeof map === 'string' ? map : JSON.stringify(map),
      directory,
    });

    for (const old of this.#bundles.keys()) {
      if (this.#bundles.size <= this.#keep) break;
      this.#bundles.delete(old);
    }
  }

  bundles() {
    return [...this.#bundles.keys()];
  }

  /** The source map remembered for `url`, as given, and the directory its sources resolve from. */
  sourceMap(url: string): { map: string; directory: string } | undefined {
    const bundle = this.#bundles.get(url);

    return bundle && { map: bundle.map, directory: bundle.directory };
  }

  symbolicate(stack: string): Symbolicated {
    const mapped = parseStack(stack).map((frame) => this.#map(frame));
    const first = mapped.find(({ frame }) => frame.kind === 'app' && frame.file);
    const codeFrame = first && this.#codeFrame(first);

    return { frames: mapped.map(({ frame }) => frame), ...(codeFrame && { codeFrame }) };
  }

  #display(file: string) {
    const path = relative(this.#root, file);

    return path.startsWith('..') || isAbsolute(path) ? file : path;
  }

  #map({ name, url, line, column }: StackFrame): Mapped {
    if (url === KERNEL_URL) return { frame: { name, kind: 'kuito' } };

    if (line === undefined || column === undefined) return { frame: { name, kind: 'native' } };

    const bundle = this.#bundles.get(url) ?? this.#besideScript(url);

    if (!bundle) return this.#atSource({ name, url, line, column });

    const position = originalPositionFor(bundle.trace, { line, column: column - 1 });

    // Code the bundler wrote, like the entry wrapper; it has no source to show.
    if (position.source === null) return { frame: { name, kind: 'kuito' } };

    const source = position.source;
    const file = resolve(bundle.directory, source);

    return {
      frame: {
        name,
        kind: kindOf(file),
        file: this.#display(file),
        line: position.line,
        column: position.column + 1,
      },
      source: () => sourceContentFor(bundle.trace, source) ?? readSource(file),
    };
  }

  /** The map beside a script inside the project, which a debug shell's frames name. */
  #besideScript(url: string): Bundle | undefined {
    const file = isAbsolute(url) ? projectFile(this.#root, url + '.map') : undefined;

    if (!file) return undefined;

    const modified = statSync(file).mtimeMs;
    const known = this.#beside.get(file);

    if (known?.modified === modified) return known.bundle;

    const map = readFileSync(file, 'utf8');
    const bundle = { trace: new TraceMap(map), map, directory: resolve(file, '..') };

    this.#beside.set(file, { modified, bundle });

    return bundle;
  }

  /**
   * A frame at `url`, a file's place relative to the root. Anything else stays
   * raw: a debug shell names its bytecode by an absolute path in the project,
   * and no frame reads a file outside it.
   */
  #atSource({ name, url, line, column }: Required<StackFrame>): Mapped {
    const file = url.includes('://') || isAbsolute(url) ? null : resolve(this.#root, url);
    const inside = file !== null && !relative(this.#root, file).startsWith('..');
    const text = inside ? readSource(file) : null;

    if (!inside || text === null) return { frame: { name, kind: 'app' } };

    return {
      frame: { name, kind: kindOf(file), file: this.#display(file), line, column },
      source: () => text,
    };
  }

  #codeFrame({ frame, source }: Mapped): CodeFrame | undefined {
    const text = source?.();
    const { file, line, column } = frame;

    if (!text || file === undefined || line === undefined || column === undefined) return;

    return { file, line, column, frame: codeFrame(text, { line, column }, 2) };
  }
}

function readSource(file: string) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

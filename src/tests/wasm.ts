// The shells' shared C++ in WebAssembly (src/cli/headless-wasm.ts builds it):
// one instance per headless host, so its views and layout nodes are that
// host's alone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HEADLESS_WASM = fileURLToPath(
  new URL('../../native/headless/headless.wasm', import.meta.url),
);

/** What the module uses of WebAssembly's JS API, which Node's types leave out. */
interface WasmMemory {
  readonly buffer: ArrayBuffer;
}

interface WasmApi {
  Module: new (bytes: Uint8Array) => object;
  Instance: new (module: object, imports: object) => { readonly exports: object };
}

const isWasmApi = (value: unknown): value is WasmApi =>
  typeof value === 'object' && value !== null && 'Module' in value && 'Instance' in value;

function wasm(): WasmApi {
  const api: unknown = Reflect.get(globalThis, 'WebAssembly');

  if (!isWasmApi(api)) throw new Error('This Node has no WebAssembly');

  return api;
}

export interface NativeExports {
  memory: WasmMemory;
  _initialize(): void;
  alloc(size: number): number;
  release(pointer: number): void;
  // Layout (native/headless/LayoutWasm.cpp).
  errorMessage(): number;
  errorLength(): number;
  create(kind: number, length: number): number;
  destroy(node: number): void;
  measured(node: number): number;
  insert(parent: number, child: number, index: number): number;
  removeFromParent(node: number): void;
  inheritFrom(node: number, host: number): void;
  isLayoutProperty(key: number): number;
  set(
    node: number,
    key: number,
    kind: number,
    value: number,
    index: number,
    text: number,
    textLength: number,
  ): number;
  setInset(node: number, top: number, right: number, bottom: number, left: number): void;
  markDirty(node: number): void;
  markContentDirty(node: number): void;
  dirty(node: number): number;
  parent(node: number): number;
  calculate(node: number, width: number, height: number, scale: number): number;
  drive(node: number, key: number, value: number): number;
  framesPointer(): number;
  framesLength(): number;
  nodesLaidOut(): number;
  measureCalls(): number;
  wastedMeasures(): number;
  // Batches (native/headless/BatchWasm.cpp).
  resultPointer(): number;
  resultLength(): number;
  decode(bytes: number, length: number, strings: number, stringsLength: number): number;
  replay(bytes: number, length: number): number;
}

/** A leaf's measure, as the engine calls the host: it writes the size at `out`. */
export type MeasureCall = (
  node: number,
  width: number,
  widthMode: number,
  height: number,
  heightMode: number,
  out: number,
) => void;

const isExports = (value: object): value is NativeExports =>
  ['memory', '_initialize', 'create', 'calculate', 'decode', 'replay'].every(
    (name) => name in value,
  );

let compiled: object | null = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class Native {
  readonly exports: NativeExports;

  constructor(measure: MeasureCall) {
    const { Module, Instance } = wasm();

    compiled ??= new Module(readFileSync(HEADLESS_WASM));

    let memory: WasmMemory | null = null;
    const unsupported = (name: string) => () => {
      throw new Error(`The headless host's C++ called WASI's ${name}, which it does not provide`);
    };
    const instance = new Instance(compiled, {
      kuito: { measure },
      // libc's start-up reads the environment, which is empty here; nothing
      // else reaches the system.
      wasi_snapshot_preview1: {
        environ_sizes_get: (count: number, size: number) => {
          if (!memory) return 1;

          new DataView(memory.buffer).setUint32(count, 0, true);
          new DataView(memory.buffer).setUint32(size, 0, true);

          return 0;
        },
        environ_get: () => 0,
        clock_time_get: unsupported('clock_time_get'),
        fd_close: unsupported('fd_close'),
        fd_seek: unsupported('fd_seek'),
        fd_write: unsupported('fd_write'),
        proc_exit: unsupported('proc_exit'),
      },
    });

    if (!isExports(instance.exports))
      throw new Error(`${HEADLESS_WASM} is not Kuito's headless module`);

    this.exports = instance.exports;
    memory = this.exports.memory;
    this.exports._initialize();
  }

  /** Runs `use` with `bytes` copied into the module's memory. */
  withBytes<T>(bytes: Uint8Array, use: (pointer: number, length: number) => T): T {
    const pointer = this.exports.alloc(Math.max(bytes.length, 1));

    try {
      new Uint8Array(this.exports.memory.buffer, pointer, bytes.length).set(bytes);

      return use(pointer, bytes.length);
    } finally {
      this.exports.release(pointer);
    }
  }

  withText<T>(text: string, use: (pointer: number, length: number) => T): T {
    return this.withBytes(encoder.encode(text), use);
  }

  /** UTF-8 the module wrote, `length` bytes at `pointer`. */
  read(pointer: number, length: number): string {
    return decoder.decode(new Uint8Array(this.exports.memory.buffer, pointer, length));
  }
}

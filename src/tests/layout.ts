// The shared layout engine (native/shared/layout) in WebAssembly, for the
// headless host: the node and calls the shells' bindings have
// (native/headless/LayoutWasm.cpp), with leaves measured by the host.
import { PROPS } from '../protocol/manifest.ts';
import { PROP_KEYS } from '../runtime/protocol.generated.ts';
import { Native } from './wasm.ts';

/** How the engine asks a leaf to measure one axis, as FlexLayout.h numbers them. */
export type MeasureMode = 'exactly' | 'atMost' | 'undefined' | 'minContent';

const MODES: readonly MeasureMode[] = ['exactly', 'atMost', 'undefined', 'minContent'];

export interface Size {
  width: number;
  height: number;
}

export type Measure = (
  width: number,
  widthMode: MeasureMode,
  height: number,
  heightMode: MeasureMode,
) => Size;

export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A node's box from the last pass, relative to its parent's border box. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** A scrolling node's content size; its own size otherwise. */
  content: Size;
  /** Padding and border: where a leaf draws its content. */
  inset: Edges;
}

const FRAME = 10;

/** The engine's work since it was made (docs/performance.md#cost-counters). */
export interface LayoutCost {
  nodesLaidOut: number;
  measureCalls: number;
  wastedMeasures: number;
  /** Boxes taken from passes, and those of them that had not changed. */
  nodesFramed: number;
  wastedFrames: number;
}

/** Each enum prop's values, which it crosses as an index into. */
const ENUMS = new Map(
  Object.entries(PROPS).flatMap(([name, spec]) =>
    spec.type === 'enum' && spec.values ? [[name, spec.values] as const] : [],
  ),
);

/** LayoutValue::Kind (native/shared/layout/KuitoLayoutStyle.h). */
const NULL = 0;
const NUMBER = 1;
const TEXT = 2;
const ENUM = 3;

function keyOf(name: string): number {
  const key = PROP_KEYS[name];

  if (key === undefined) throw new Error(`No prop is named ${name}`);

  return key;
}

/**
 * A layout prop's value: a number or a boolean, a length's text (`50%`,
 * `auto`), an enum's value by name or by its index among the manifest's, or
 * null for the kind's default.
 */
export type LayoutInput = number | boolean | string | { index: number } | null;

const EMPTY: Box = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  content: { width: 0, height: 0 },
  inset: { top: 0, right: 0, bottom: 0, left: 0 },
};

const sameBox = (a: Box | undefined, b: Box): boolean =>
  a !== undefined &&
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height &&
  a.content.width === b.content.width &&
  a.content.height === b.content.height &&
  a.inset.top === b.inset.top &&
  a.inset.right === b.inset.right &&
  a.inset.bottom === b.inset.bottom &&
  a.inset.left === b.inset.left;

/**
 * One layout engine: its nodes live in its own WebAssembly memory. Invalid
 * props and kinds throw what the engine says, as the shells' setters do.
 */
export class LayoutEngine {
  /** The module the engine's nodes live in, which the host's batch checks share. */
  readonly native: Native;
  private readonly measures = new Map<number, Measure>();
  private readonly boxes = new Map<number, Box>();
  private texts = 0;
  private framed = 0;
  private unchanged = 0;

  private get exports() {
    return this.native.exports;
  }

  constructor() {
    this.native = new Native((node, width, widthMode, height, heightMode, out) =>
      this.measure(node, width, widthMode, height, heightMode, out),
    );
  }

  private measure(
    node: number,
    width: number,
    wm: number,
    height: number,
    hm: number,
    out: number,
  ): void {
    const measure = this.measures.get(node);

    if (!measure) throw new Error('The layout engine measured a node with no measure');

    const size = measure(width, MODES[wm] ?? 'undefined', height, MODES[hm] ?? 'undefined');
    const result = new Float32Array(this.exports.memory.buffer, out, 2);

    result[0] = size.width;
    result[1] = size.height;
  }

  /** A node with `kind`'s defaults; a measured kind's leaf calls `measure`. */
  create(kind: string, measure?: Measure): number {
    const node = this.withText(kind, (pointer, length) => this.exports.create(pointer, length));

    if (node === 0) throw new Error(this.error());

    if (this.measured(node)) {
      if (!measure) throw new Error(`A ${kind} is measured: give it a measure`);
      this.measures.set(node, measure);
    }

    return node;
  }

  destroy(node: number): void {
    this.measures.delete(node);
    this.boxes.delete(node);
    this.exports.destroy(node);
  }

  /** Whether the kind's leaf is measured by the platform: text, controls, lists. */
  measured(node: number): boolean {
    return this.exports.measured(node) !== 0;
  }

  /** Moves `child` from its parent, if any, to `index` in `parent`. */
  insert(parent: number, child: number, index: number): void {
    if (!this.exports.insert(parent, child, index)) throw new Error(this.error());
  }

  removeFromParent(node: number): void {
    this.exports.removeFromParent(node);
  }

  /** A node laid out on its own (a page) inherits `direction` from `host`'s; 0 from nothing. */
  inheritFrom(node: number, host: number): void {
    this.exports.inheritFrom(node, host);
  }

  /**
   * The strings props carried into the engine: a length written as text.
   * Names never cross, and an enum crosses as its index.
   */
  get textValues(): number {
    return this.texts;
  }

  isLayoutProperty(name: string): boolean {
    return this.exports.isLayoutProperty(keyOf(name)) !== 0;
  }

  /**
   * By key, as the host batch types the value: a number or a boolean, an
   * enum's value by its index, a length's text (`50%`, `auto`) the engine
   * reads, or null for the kind's default.
   */
  set(node: number, name: string, value: LayoutInput): void {
    const key = keyOf(name);
    const values = ENUMS.get(name);
    const ok =
      value === null
        ? this.exports.set(node, key, NULL, 0, 0, 0, 0)
        : typeof value === 'object'
          ? this.exports.set(node, key, ENUM, 0, value.index, 0, 0)
          : typeof value !== 'string'
            ? this.exports.set(node, key, NUMBER, Number(value), 0, 0, 0)
            : values
              ? this.exports.set(node, key, ENUM, 0, values.indexOf(value), 0, 0)
              : this.text(value, (pointer, length) =>
                  this.exports.set(node, key, TEXT, 0, 0, pointer, length),
                );

    if (!ok) throw new Error(this.error());
  }

  /** Padding the platform adds on top of the node's own: a safe-area inset. */
  setInset(node: number, { top, right, bottom, left }: Edges): void {
    this.exports.setInset(node, top, right, bottom, left);
  }

  /** What `measure` returns changed: the node lays out again in the next pass. */
  markDirty(node: number): void {
    this.exports.markDirty(node);
  }

  /**
   * A change to what `measure` returns. The climb stops at the first
   * fixed-size ancestor (Node::markContentDirty).
   */
  markContentDirty(node: number): void {
    this.exports.markContentDirty(node);
  }

  /** Whether the next pass lays the node out again. */
  dirty(node: number): boolean {
    return this.exports.dirty(node) !== 0;
  }

  /** The node's parent, or 0 when it is a root. */
  parent(node: number): number {
    return this.exports.parent(node);
  }

  /**
   * Lays out `root`'s tree at the given size (NaN wraps the content along
   * that side), with edges rounded to pixels of `scale`.
   */
  calculate(root: number, width: number, height: number, scale: number): void {
    if (!this.exports.calculate(root, width, height, scale)) throw new Error(this.error());

    this.readFrames();
  }

  /**
   * A number prop that moves every frame, as the UI thread drives it: lays
   * out at once only the smallest subtree around `node` whose boxes it can
   * change, and returns that subtree's nodes, breadth first. Null when the
   * change reaches the root: it lays out in the next `calculate`.
   */
  drive(node: number, name: string, value: number): number[] | null {
    if (!this.exports.drive(node, keyOf(name), value)) throw new Error(this.error());

    const laidOut = this.readFrames();

    return laidOut.length ? laidOut : null;
  }

  cost(): LayoutCost {
    return {
      nodesLaidOut: this.exports.nodesLaidOut(),
      measureCalls: this.exports.measureCalls(),
      wastedMeasures: this.exports.wastedMeasures(),
      nodesFramed: this.framed,
      wastedFrames: this.unchanged,
    };
  }

  /** Takes the boxes the last pass wrote; returns their nodes in order. */
  private readFrames(): number[] {
    const values = new Float64Array(
      this.exports.memory.buffer,
      this.exports.framesPointer(),
      this.exports.framesLength(),
    );
    const nodes: number[] = [];

    for (let at = 0; at < values.length; at += FRAME + 1) {
      const [x, y, width, height, contentWidth, contentHeight, top, right, bottom, left] =
        values.subarray(at + 1, at + 1 + FRAME);
      const node = values[at] ?? 0;

      const box = {
        x,
        y,
        width,
        height,
        content: { width: contentWidth, height: contentHeight },
        inset: { top, right, bottom, left },
      };

      nodes.push(node);
      this.framed++;
      if (sameBox(this.boxes.get(node), box)) this.unchanged++;
      this.boxes.set(node, box);
    }

    return nodes;
  }

  /** The node's box from the last pass that laid out its tree; zero before its first. */
  box(node: number): Box {
    return this.boxes.get(node) ?? EMPTY;
  }

  private error(): string {
    return this.native.read(this.exports.errorMessage(), this.exports.errorLength());
  }

  private withText<T>(text: string, use: (pointer: number, length: number) => T): T {
    return this.native.withText(text, use);
  }

  /** A prop's text crosses into the engine, counted as a device's would be copied. */
  private text<T>(text: string, use: (pointer: number, length: number) => T): T {
    this.texts++;

    return this.withText(text, use);
  }
}

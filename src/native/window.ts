import Window, {
  type WindowInsets as Insets,
  type WindowMetrics,
  type WindowOrientation as Orientation,
} from '../../native/modules/window/window';
import { provideWindowWidth } from './media/window-width';
import { source, type ReadonlySignal } from './scope';

/** How far the system bars, the notch and the home indicator reach into the window. */
export type WindowInsets = Insets;

export type WindowOrientation = Orientation;

export type WindowSize = { width: number; height: number };

/** The window's width class, by its width: under 600, under 840, and wider. */
export type WidthClass = 'compact' | 'medium' | 'expanded';

/** Follows the window's metrics while watched: what a part of it is made from. */
const metrics = Window.metrics as ReadonlySignal<WindowMetrics> & {
  subscribe(listener: () => void): () => void;
};

/**
 * A part of the window that stays the same object while its fields stay, so
 * what follows `size` re-renders only for a new size.
 */
function part<T extends Record<string, unknown>>(pick: (metrics: WindowMetrics) => T) {
  let last: T | null = null;
  const stable = (): T => {
    const next = pick(metrics.value);
    const previous = last;

    if (previous && Object.keys(next).every((key) => previous[key] === next[key])) return previous;

    last = next;

    return next;
  };

  return source(stable, (set) => metrics.subscribe(() => set(stable())));
}

/** The window's width and height. */
export const size = /* @__PURE__ */ part((metrics): WindowSize => ({
  width: metrics.width,
  height: metrics.height,
}));

/** The safe area's insets from each edge of the window. */
export const insets = /* @__PURE__ */ part((metrics): WindowInsets => ({ ...metrics.insets }));

/** `landscape` when the window is wider than it is tall. */
export const orientation = /* @__PURE__ */ source(
  () => metrics.value.orientation,
  (set) => metrics.subscribe(() => set(metrics.value.orientation)),
);

/**
 * `compact`, `medium` or `expanded`, as Material's window size classes:
 * the signal `@media (width-class: …)` follows, so a component and a
 * stylesheet agree on it.
 */
export const widthClass: ReadonlySignal<WidthClass> = {
  get value() {
    if (!globalThis.__kuito) throw new Error('window.widthClass requires the Kuito runtime');

    provideWindowWidth();

    return globalThis.__kuito.widthClass().value;
  },
};

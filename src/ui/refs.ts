import type { ElementProperties } from './props.generated';

/** Native view handles, as exposed to refs and event listeners. */
export interface ElementRef<T> {
  current: T | null;
}

export interface KuitoNativeEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  readonly isTrusted?: boolean;
  target?: ElementHandle;
  currentTarget?: ElementHandle | null;
  defaultPrevented?: boolean;
  eventPhase?: number;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
  preventDefault(): void;
  composedPath(): ElementHandle[];
}

export interface ElementHandle {
  readonly id: string;
  readonly parent: ElementHandle | null;
  readonly children: ElementHandle[];
  focus(): void;
  blur(): void;
  /** Sets a native prop on the view now, until its binding writes it again. */
  setProperty<K extends keyof ElementProperties>(key: K, value: ElementProperties[K] | null): void;
  addEventListener(
    type: string,
    fn: (e: KuitoNativeEvent) => void,
    options?: boolean | { capture?: boolean; once?: boolean; signal?: AbortSignal },
  ): void;
  removeEventListener(
    type: string,
    fn: (e: KuitoNativeEvent) => void,
    options?: boolean | { capture?: boolean },
  ): void;
  /**
   * Sends an event through the tree, capture to bubble, as a native one travels:
   * a `KuitoCustomEvent`, or any object with a `type`. False when a listener
   * called `preventDefault()` on a cancelable event.
   */
  dispatchEvent(event: { type: string; bubbles?: boolean; cancelable?: boolean }): boolean;
}

/** What a Scroll ref holds: its element, and methods that scroll it. */
export interface ScrollHandle extends ElementHandle {
  /**
   * Scrolls to `offset` points along the view's axis, or to `page`, a whole
   * view length each from 0, as `paging` rests; animated by default.
   */
  scrollTo(
    params: { offset: number; animated?: boolean } | { page: number; animated?: boolean },
  ): void;
  /** Scrolls to the end of the content, including what the same update added. */
  scrollToEnd(params?: { animated?: boolean }): void;
}

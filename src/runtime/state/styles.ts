// Native classes and the conditions they branch on.
import type { AnySignal, Computed, Signal } from '../signals';
import { dict } from '../values';

export const nativeStyles = dict<Record<string, unknown>>();

/** The window's width class, by its width in points (src/runtime/style-conditions.ts). */
export type WidthClass = 'compact' | 'medium' | 'expanded';

/** An `@media` query as the style compiler writes it (src/style/media.ts): every field must hold. */
export interface StyleMedia {
  colorScheme?: 'light' | 'dark';
  minWidth?: number;
  maxWidth?: number;
  widthClass?: WidthClass;
  reduceMotion?: boolean;
}

/** What classes branch on: their `@media` alternates, and each token marker's values. */
export const styleConditions: {
  when: Record<string, { media: StyleMedia; props: Record<string, unknown> }[]>;
  themes: Record<'light' | 'dark', Record<string, unknown>>;
  /** Each class's variants: the class each value of each data attribute applies. */
  variants: Record<string, Record<string, Record<string, string>>>;
  /**
   * The platform's signals conditions read, which the app's bundle provides
   * (src/native/media.ts): module functions are linked by the app's ids,
   * which the kernel does not know.
   */
  sources: { colorScheme?: AnySignal; windowMetrics?: AnySignal };
  /** The system state conditions read, made the first time a class needs one. */
  media: {
    /** `light`, `dark` or null: no preference reads as light. */
    colorScheme: AnySignal;
    width: Signal<number>;
    widthClass: Computed<WidthClass>;
    reduceMotion: Signal<boolean>;
  } | null;
} = {
  when: dict(),
  themes: { light: dict(), dark: dict() },
  variants: dict(),
  sources: {},
  media: null,
};

export const settings = { rootFontSize: 16 };

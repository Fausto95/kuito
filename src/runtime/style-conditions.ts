// Styles that branch on system state (docs/styles.md#conditions). The style
// compiler hands each class its props, alternate prop sets under `@media`
// queries, and token markers with their value in each color scheme; nothing
// here reads CSS. A class's value for a prop is a choice the kernel resolves
// by reading the color scheme, the window's width and the motion preference
// as signals, so the prop follows them as a binding: a change re-sends only
// the props it changes, and no branch is planned again.
import { accessibility } from './accessibility';
import {
  computed,
  createSource,
  isSignal,
  type AnySignal,
  type Computed,
  type Signal,
} from './signals';
import { nativeStyles, styleConditions, type StyleMedia, type WidthClass } from './state/styles';
import { dict, isPlainData, own } from './values';

/** What a class's props may hold: a constant, a token, or a choice between them. */
type StyleValue = unknown;

/** A class's `@media` alternate for one prop, over what the prop is otherwise. */
class Choice {
  media: StyleMedia;
  value: StyleValue;
  /** The value while the media does not hold; undefined leaves the prop unset. */
  otherwise: StyleValue;

  constructor(media: StyleMedia, value: StyleValue, otherwise: StyleValue) {
    this.media = media;
    this.value = value;
    this.otherwise = otherwise;
  }
}

const isChoice = (value: StyleValue): value is Choice => value instanceof Choice;

function isToken(value: StyleValue): value is { __kuitoToken: string } {
  return isPlainData(value) && typeof value.__kuitoToken === 'string';
}

/** Whether a prop's value is the same whatever the system state. */
export const isFixed = (value: StyleValue): boolean => !isChoice(value) && !isToken(value);

/** The window's width class, as Material's window size classes: by width in points. */
const widthClassOf = (width: number): WidthClass =>
  width < 600 ? 'compact' : width < 840 ? 'medium' : 'expanded';

function width(metrics: unknown): number {
  const value = isPlainData(metrics) ? metrics.width : undefined;

  if (typeof value !== 'number' || !Number.isFinite(value))
    throw TypeError('Invalid window metrics: width must be a finite number');

  return value;
}

/** No preference reads as light, as CSS's prefers-color-scheme does. */
const scheme = (value: unknown): 'light' | 'dark' => (value === 'dark' ? 'dark' : 'light');

/** The system state conditions read, each a signal made on first use. */
function media() {
  return (styleConditions.media ??= makeMedia());
}

/**
 * The platform's signals conditions read, from the app's bundle: styles that
 * branch import src/native/media.ts, which provides them.
 */
export function provideMedia(sources: unknown): void {
  const given = isPlainData(sources) ? sources : {};
  const { colorScheme, windowMetrics } = given;

  if (
    !isPlainData(sources) ||
    Object.keys(given).some((key) => key !== 'colorScheme' && key !== 'windowMetrics') ||
    (colorScheme !== undefined && !isSignal(colorScheme)) ||
    (windowMetrics !== undefined && !isSignal(windowMetrics))
  )
    throw new TypeError(
      'provideMedia takes { colorScheme?, windowMetrics? }, the platform signals styles read',
    );

  if (colorScheme) styleConditions.sources.colorScheme = colorScheme;
  if (windowMetrics) styleConditions.sources.windowMetrics = windowMetrics;
}

function provided(source: AnySignal | undefined, what: string): AnySignal {
  if (!source)
    throw new Error(
      'Styles that follow the ' +
        what +
        ' need its platform signal, which the style compiler imports with them: rebuild the app.',
    );

  return source;
}

function makeMedia() {
  const metrics = () => provided(styleConditions.sources.windowMetrics, "window's width");
  // A source rather than a computed: unwatched, a read asks the platform once.
  const windowWidth: Signal<number> = createSource(
    () => width(metrics().value),
    (set) => metrics().subscribe(() => set(width(metrics().value))),
  );

  return {
    // Provided when a stylesheet that follows it loads, which may be after the first.
    get colorScheme() {
      return provided(styleConditions.sources.colorScheme, 'color scheme');
    },
    width: windowWidth,
    widthClass: computed(() => widthClassOf(windowWidth.value)),
    reduceMotion: createSource(
      () => accessibility.status()?.reduceMotionEnabled === true,
      (set) => {
        const subscription = accessibility.addEventListener('reduceMotion', (on: unknown) =>
          set(on === true),
        );

        return () => subscription.remove();
      },
    ),
  };
}

/** The window's width class as a signal, for `window.widthClass`. */
export const widthClass = (): Computed<WidthClass> => media().widthClass;

/** What a resolve read: the signals a prop follows. */
type Reads = Set<AnySignal>;

function read<T>(signal: { readonly value: T } & AnySignal, reads: Reads | undefined): T {
  reads?.add(signal);

  return signal.value;
}

/** Each feature a query names must hold. */
function holds(query: StyleMedia, reads: Reads | undefined): boolean {
  const system = media();

  return (
    (query.colorScheme === undefined ||
      scheme(read(system.colorScheme, reads)) === query.colorScheme) &&
    (query.minWidth === undefined || read(system.width, reads) >= query.minWidth) &&
    (query.maxWidth === undefined || read(system.width, reads) <= query.maxWidth) &&
    (query.widthClass === undefined || read(system.widthClass, reads) === query.widthClass) &&
    (query.reduceMotion === undefined || read(system.reduceMotion, reads) === query.reduceMotion)
  );
}

/**
 * A prop's value now. Inside a binding, what it reads is tracked; a plan
 * passes `reads` and resolves untracked, so a class's system state never
 * counts as what its component read.
 */
export function resolveStyle(value: StyleValue, reads?: Reads): unknown {
  if (isChoice(value))
    return resolveStyle(holds(value.media, reads) ? value.value : value.otherwise, reads);

  if (isToken(value)) {
    const theme = styleConditions.themes[scheme(read(media().colorScheme, reads))];

    if (!own(theme, value.__kuitoToken))
      throw TypeError('Unknown style token ' + value.__kuitoToken + ': rebuild the app');

    return theme[value.__kuitoToken];
  }

  return value;
}

/**
 * Each prop `names`' classes set, the later class winning, as a value that
 * may depend on system state: a class's `@media` alternates win over its own
 * props while their query holds.
 */
export function classValues(names: string[]): Record<string, StyleValue> {
  const values = dict<StyleValue>();

  names.forEach((name) => {
    Object.assign(values, nativeStyles[name]);

    (own(styleConditions.when, name) ? styleConditions.when[name] : []).forEach(
      ({ media: query, props }) => {
        Object.keys(props).forEach((key) => {
          values[key] = new Choice(query, props[key], own(values, key) ? values[key] : undefined);
        });
      },
    );
  });

  return values;
}

/**
 * `names` with the variant classes their data attributes pick, each right
 * after its class: `card`, `{ size: 'large' }` is `card` then the class of
 * `.card[data-size=large]`. A data attribute applies to every class in the
 * list that has it, and to none is an error.
 */
export function withVariants(names: string[], attributes: Record<string, string>): string[] {
  const { variants } = styleConditions;
  const of = (name: string) => (own(variants, name) ? variants[name] : null);

  Object.keys(attributes).forEach((attribute) => {
    if (!names.some((name) => own(of(name) ?? {}, attribute)))
      throw TypeError(
        'No class in "' +
          names.join(' ') +
          '" has a ' +
          attribute +
          ' variant. Declare it as .' +
          (names[0] ?? 'class') +
          '[data-' +
          attribute +
          '=…] or in its styles() variants.',
      );
  });

  return names.flatMap((name) => {
    const picks = of(name);

    if (!picks) return [name];

    return [
      name,
      ...Object.keys(attributes).flatMap((attribute) => {
        if (!own(picks, attribute)) return [];

        const values = picks[attribute];
        const value = attributes[attribute];

        if (!own(values, value))
          throw TypeError(
            name +
              ' has no ' +
              attribute +
              ' variant "' +
              value +
              '": it has ' +
              Object.keys(values).join(', '),
          );

        return [values[value]];
      }),
    ];
  });
}

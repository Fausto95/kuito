# Styles

Kuito compiles CSS at build time into native view properties, from `.css` modules or from `styles({...})` in TypeScript; nothing parses CSS on the device.

**Use it for**

- Sharing a look between views with classes, variants and tokens.
- Light and dark themes, size classes and per-platform tweaks.
- Layouts that mirror for right-to-left languages, and changes that animate.

```css
/* card.css */
.card {
  padding: 20px 24px;
  border: 1px solid #ffffff22;
  border-radius: 20px;
  box-shadow: 0 12px 32px #00000066;
  background: linear-gradient(135deg, #1e3a5f, #0b1220);
}

.selected {
  border-color: #8bc6ff;
}
```

```tsx
import { Pressable, Text, signal } from 'kuito';
import css from './card.css';

export function Card() {
  const selected = signal(false);

  return (
    <Pressable
      class={[css.card, selected.value && css.selected]}
      onPress={() => (selected.value = !selected.value)}
    >
      <Text>Tap to select</Text>
    </Pressable>
  );
}
```

- `class` takes names from a `.css` import or `styles()`, as a space-separated string or a list whose falsy entries are skipped. The later class wins.
- Lengths take `px` (or `dp`), `rem` and `em` ([CSS units](./css-units.md)).
- An unknown property or an unsupported value fails the build with the file, the line and the reason.

## Write styles in TypeScript

`styles()` takes the same properties in camelCase, with the same values, shorthand strings included. It initializes a `const` wherever one can be declared: module scope, a component body, a block.

```tsx
import { Box, Text, styles } from 'kuito';

const sheet = styles({
  badge: { padding: '4px 8px', borderRadius: 12, backgroundColor: '#ff5a5f', fontWeight: 600 },
});

export function Badge() {
  return (
    <Box class={sheet.badge}>
      <Text>New</Text>
    </Box>
  );
}
```

A primitive also takes `style={{ ... }}` for what one view alone needs; `style` wins over `class`. A declaration whose value changes must name one native prop (`opacity`, `paddingTop`): a shorthand with an expression is a build error.

## Pick a variant

A class's variants are rules for its data attributes: `.button[data-tone=primary]` in a stylesheet, `variants` in `styles()`. A class list picks them with an object; a falsy value picks none. A variant wins over its class.

```tsx
import { Pressable, Text, signal, styles } from 'kuito';

const button = styles({
  base: {
    padding: '8px 16px',
    variants: { tone: { primary: { backgroundColor: '#ff5a5f' }, quiet: { opacity: 0.7 } } },
  },
});

export function Action() {
  const tone = signal<'primary' | 'quiet'>('primary');

  return (
    <Pressable class={[button.base, { tone: tone.value }]} onPress={() => (tone.value = 'quiet')}>
      <Text>Continue</Text>
    </Pressable>
  );
}
```

## Share tokens and theme them

Custom properties in `:root` are tokens: `var(--name)` becomes its value at build time. A stylesheet sees its own tokens and those of the stylesheets it `@import`s. A `:root` inside `@media (prefers-color-scheme: dark)` redefines them for dark mode; a theme change re-sends only the props that follow them.

```css
/* tokens.css */
:root {
  --space: 16px;
  --accent: #2563eb;
}

@media (prefers-color-scheme: dark) {
  :root {
    --accent: #8bc6ff;
  }
}
```

```css
@import './tokens.css';

.card {
  padding: var(--space);
  border: 1px solid var(--accent);
}
```

A `:root` in `@media` takes `prefers-color-scheme` only.

## Adapt to the screen and the platform

`@media` blocks hold rules that apply while their query holds; features join with `and`. A condition's declarations win over its class's own while it holds.

| Feature                  | Values                          |
| ------------------------ | ------------------------------- |
| `min-width`, `max-width` | a length in `px`                |
| `width-class`            | `compact`, `medium`, `expanded` |
| `prefers-color-scheme`   | `light`, `dark`                 |
| `prefers-reduced-motion` | `reduce`, `no-preference`       |

An `@platform` block names `ios` or `android`; the other platform's bundle never sees it. In TypeScript, `platform` from `kuito` is a constant the compiler fixes per bundle.

```css
@media (width-class: expanded) {
  .grid {
    flex-direction: row;
  }
}

@platform android {
  .card {
    padding: 12px;
  }
}
```

## Lay out for right-to-left languages

The app lays out in the direction of the user's first language. Logical properties name the side lines start from, so they land on the right in Arabic or Hebrew:

```css
.row {
  padding-inline-start: 16px; /* the left in ltr, the right in rtl */
  margin-inline: 0 8px; /* start, then end */
}

.badge {
  position: absolute;
  inset-inline-end: 4px;
}
```

- `padding-inline`, `margin-inline` and `inset-inline` take a start and an optional end, and each side has its longhand. As props: `paddingInlineStart`, `marginInlineEnd`, `insetInlineStart`, …
- A logical side wins over the physical side it lands on, whatever their order.
- `direction: ltr` or `rtl` sets a subtree's direction, and inherits as in CSS.
- The block sides (`padding-block`, …) are top and bottom. Borders have no logical sides, and `text-align: start` and `end` compile to `left` and `right`.

[Localization and RTL](../guides/localization-rtl.md) covers what mirrors and what does not.

## Animate a change

`transition` lists properties with a duration, a timing function and a delay, as in CSS. A change to one of them, from a class, a variant or a condition, then moves instead of jumping, on the UI thread. Here `class={[css.card, { state: open.value ? 'open' : null }]}` opens the card:

```css
.card {
  border-radius: 20px;
  transition:
    transform 400ms spring(14, 180),
    border-radius 200ms ease-out,
    box-shadow 250ms ease-in-out 50ms;
}

.card[data-state='open'] {
  border-radius: 8px;
  transform: scale(1.02);
  box-shadow: 0 24px 48px #00000080;
}
```

- Animatable: `opacity`, `background-color`, `transform`, `border-radius`, `border-color`, `box-shadow`, `width`, `height` and `all`. A width or height moves only between numbers.
- Timing functions: `linear`, `ease` (the default), `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier(x1, y1, x2, y2)` and `spring(damping, stiffness[, mass])`, which ignores the duration.

It compiles to the same `transition` prop [Motion](../guides/motion.md#animate-a-prop-when-state-changes) describes.

## Related

- [CSS units](./css-units.md): `px`, `rem` and `em`
- [Motion](../guides/motion.md): animations and gestures in TypeScript
- [Styles in depth](../../../../docs/styles.md): values and colors, the property table, flexbox layout, platform notes

# Style native views

Use CSS modules for reusable visual rules, styles() for TypeScript-authored
rules, and view props for values that change with state. Kuito compiles styles
to native properties; it supports a defined CSS subset, not the browser cascade.

## Style a reusable card

Create `card.css` beside the component:

```css
.card {
  padding: 16px;
  gap: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background-color: #ffffff;
}
.selected {
  border-color: #2563eb;
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
      <Text>{selected.value ? 'Selected' : 'Select this card'}</Text>
    </Pressable>
  );
}
```

Class arrays ignore falsy entries. Later classes win; an inline style wins over
class declarations. Unsupported properties or values fail the build with a
source location, so do not assume a browser stylesheet can be copied unchanged.

## Write rules in TypeScript

```tsx
import { Text, styles } from 'kuito';

const css = styles({
  badge: {
    padding: '4px 8px',
    borderRadius: 8,
    variants: { tone: { success: { color: '#15803d' }, muted: { color: '#64748b' } } },
  },
});

export function Badge() {
  return <Text class={[css.badge, { tone: 'success' }]}>Saved</Text>;
}
```

styles is compiler-only. Use camelCase properties and static declarations.
Variants select rules from data attributes. In CSS the equivalent selector is
`.badge[data-tone=success]`. Dynamic style expressions must name one native
property; an expression inside a shorthand cannot be expanded at runtime.

## Tokens

```css
:root {
  --space: 16px;
  --surface: #ffffff;
  --ink: #0f172a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #0f172a;
    --ink: #f8fafc;
  }
}
.panel {
  padding: var(--space);
  background-color: var(--surface);
  color: var(--ink);
}
```

Import a shared token stylesheet with `@import './tokens.css'`. Tokens resolve
at build time; color-scheme overrides stay responsive to the system setting.
Missing or circular token references are errors. A conditional :root supports
color scheme, not arbitrary runtime variables.

## Layout

Use stacks and flex properties for rows and columns. Sizes, margins, gaps and
insets accept percentages where the layout engine can resolve them. Padding,
borders and text dimensions do not accept percentages. Use position:absolute
and insets for overlays; absolute children do not reserve normal-flow space.

```css
.row {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.content {
  flex: 1;
  min-width: 0;
}
.badge {
  position: absolute;
  top: 8px;
  right: 8px;
}
```

Use [CSS units](css-units.md) for point, font-relative and percentage sizing.

## Conditions

```css
@media (width-class: expanded) {
  .panel {
    flex-direction: row;
  }
}
@media (min-width: 600px) {
  .panel {
    padding: 24px;
  }
}
@platform android {
  .panel {
    border-radius: 16px;
  }
}
```

Supported media features are min-width, max-width, width-class,
prefers-color-scheme and prefers-reduced-motion. Combine conditions with and.
Platform branches are selected at build time. Use the exported platform value
for behavior that must differ, rather than testing device names.

## Right to left

```css
.row {
  padding-inline-start: 16px;
  margin-inline-end: 8px;
}
.badge {
  position: absolute;
  inset-inline-end: 4px;
}
```

Logical inline sides follow inherited direction; block sides are top and bottom.
A logical side wins over the physical side it maps to. Borders have no logical
side properties. text-align:start/end currently compile to left/right, so check
mixed-direction text explicitly. See [localization and RTL](localization-rtl.md).

## Colors

Use the compiler's supported named, hex and functional colors. Hex colors make
examples unambiguous, including alpha. Background supports a color or a linear
gradient. Shadows and borders are native view effects and may differ visually
between platforms; verify them on both.

```css
.card {
  background: linear-gradient(135deg, #1d4ed8, #0f172a);
  color: #ffffff;
  border: 1px solid #ffffff44;
  box-shadow: 0 8px 24px #00000033;
}
```

## Transitions

```css
.card {
  opacity: 0.7;
  transition:
    opacity 200ms ease-out,
    transform 300ms spring(14, 180);
}
.card[data-state='selected'] {
  opacity: 1;
  transform: scale(1.02);
}
```

Transitions support opacity, background-color, transform, border-radius,
border-color, box-shadow, width, height and all. Numeric dimensions animate;
auto and percentage changes apply immediately. Timing functions include linear,
ease variants, cubic-bezier and spring. Reduced motion skips interpolation.
See [motion](motion.md) for animation composition and gesture-driven values.

## Supported properties

The table is generated from the compiler. The [property reference](https://kuito.dev/docs/language/css-properties)
adds a concrete declaration and use case for every property.

<!-- style properties: generated from src/style/properties.ts -->

| CSS                                                                                                                                                                                                                                                                                                                                                                 | Native props                                                                                                                                                                                        | Values                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `background`                                                                                                                                                                                                                                                                                                                                                        | `backgroundColor`, `backgroundGradient`                                                                                                                                                             | color, or `linear-gradient(<angle> \| to <side>, color, color, …)`                             |
| `background-color`, `color`                                                                                                                                                                                                                                                                                                                                         | same, in camelCase                                                                                                                                                                                  | color ([colors](#colors))                                                                      |
| `opacity`                                                                                                                                                                                                                                                                                                                                                           | same                                                                                                                                                                                                | 0–1                                                                                            |
| `padding`                                                                                                                                                                                                                                                                                                                                                           | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                                                        | 1–4 non-negative lengths, like CSS                                                             |
| `padding-top`, `padding-right`, `padding-bottom`, `padding-left`, `padding-horizontal`, `padding-vertical`                                                                                                                                                                                                                                                          | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                                                        | non-negative length                                                                            |
| `padding-inline`, `padding-inline-start`, `padding-inline-end`, `padding-block`, `padding-block-start`, `padding-block-end`, `inset-inline`, `inset-inline-start`, `inset-inline-end`, `inset-block`, `inset-block-start`, `inset-block-end`, `margin-inline`, `margin-inline-start`, `margin-inline-end`, `margin-block`, `margin-block-start`, `margin-block-end` | `paddingInlineStart`, `paddingInlineEnd`, `paddingTop`, `paddingBottom`, `insetInlineStart`, `insetInlineEnd`, `top`, `bottom`, `marginInlineStart`, `marginInlineEnd`, `marginTop`, `marginBottom` | a start and an optional end, as their physical sides take; see [Right to left](#right-to-left) |
| `gap`, `row-gap`, `column-gap`, `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`, `aspect-ratio`                                                                                                                                                                                                                                             | `rowGap`, `columnGap`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `aspectRatio`                                                                                           | see [Layout](#layout)                                                                          |
| `overflow`, `direction`, `box-sizing`, `position`, `top`, `right`, `bottom`, `left`, `margin-top`, `margin-right`, `margin-bottom`, `margin-left`                                                                                                                                                                                                                   | same, in camelCase                                                                                                                                                                                  | see [Layout](#layout)                                                                          |
| `flex-direction`, `flex-wrap`, `flex-grow`, `flex-shrink`, `flex-basis`, `flex-line-count`, `align-items`, `align-self`, `align-content`, `justify-content`                                                                                                                                                                                                         | same, in camelCase                                                                                                                                                                                  | see [Layout](#layout)                                                                          |
| `inset`, `margin`, `margin-horizontal`, `margin-vertical`, `flex`, `flex-flow`                                                                                                                                                                                                                                                                                      | `top`, `right`, `bottom`, `left`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `flexGrow`, `flexShrink`, `flexBasis`, `flexDirection`, `flexWrap`                                      | see [Layout](#layout)                                                                          |
| `display`, `hidden`                                                                                                                                                                                                                                                                                                                                                 | `hidden`                                                                                                                                                                                            | `none`, `flex`; `hidden` takes `true` or `false`                                               |
| `border`                                                                                                                                                                                                                                                                                                                                                            | `borderWidth`, `borderColor`                                                                                                                                                                        | `<width> solid <color>`, in any order, each at most once; or `none`                            |
| `border-radius`, `corner-radius`, `border-width`, `border-color`                                                                                                                                                                                                                                                                                                    | `borderRadius`, `borderWidth`, `borderColor`                                                                                                                                                        | non-negative length / color                                                                    |
| `box-shadow`                                                                                                                                                                                                                                                                                                                                                        | `shadowOffsetX`, `shadowOffsetY`, `shadowRadius`, `shadowColor`                                                                                                                                     | `<x> <y> [blur] <color>`; blur is halved into the native radius                                |
| `shadow-color`, `shadow-radius`, `shadow-offset-x`, `shadow-offset-y`                                                                                                                                                                                                                                                                                               | same, in camelCase                                                                                                                                                                                  | color / length                                                                                 |
| `font-size`, `letter-spacing`                                                                                                                                                                                                                                                                                                                                       | same, in camelCase                                                                                                                                                                                  | length                                                                                         |
| `line-height`                                                                                                                                                                                                                                                                                                                                                       | same, in camelCase                                                                                                                                                                                  | length, or a unitless multiple of the font size                                                |
| `font-weight`                                                                                                                                                                                                                                                                                                                                                       | same, in camelCase                                                                                                                                                                                  | `normal`, `bold`, `100`–`900`                                                                  |
| `font-family`, `font-style`                                                                                                                                                                                                                                                                                                                                         | same, in camelCase                                                                                                                                                                                  | a system, bundled or loaded family ([fonts](fonts.md)); `normal`, `italic`                     |
| `text-align`, `text-transform`                                                                                                                                                                                                                                                                                                                                      | same, in camelCase                                                                                                                                                                                  | `left`/`center`/`right`; `none`/`uppercase`/`lowercase`/`capitalize`                           |
| `-webkit-line-clamp`, `number-of-lines`                                                                                                                                                                                                                                                                                                                             | `lineClamp`                                                                                                                                                                                         | whole number (`0` = unlimited)                                                                 |
| `transform`                                                                                                                                                                                                                                                                                                                                                         | `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`                                                                                                                                   | `translate()`, `translateX/Y()`, `scale()`, `scaleX/Y()`, `rotate(deg\|rad\|turn)`, `none`     |
| `translate-x`, `translate-y`, `scale`, `scale-x`, `scale-y`, `rotate`                                                                                                                                                                                                                                                                                               | same, in camelCase                                                                                                                                                                                  | length; a number; an angle (`deg`, `rad`, `turn`)                                              |
| `transition`                                                                                                                                                                                                                                                                                                                                                        | same                                                                                                                                                                                                | see [Transitions](#transitions)                                                                |

<!-- end of generated style properties -->

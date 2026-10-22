# Native styles

Kuito compiles styles at build time into native properties. `.css` modules
and `styles({...})` share one property table (`src/style/properties.ts`):
CSS uses kebab-case names, `styles()` uses camelCase, and both accept the same
values, including shorthand strings. Nothing parses CSS on the device.

```css
.card {
  padding: 20px 24px;
  border: 1px solid #ffffff22;
  border-radius: 20px;
  box-shadow: 0 12px 32px #00000066;
  background: linear-gradient(135deg, #1e3a5f, #0b1220);
  transition:
    transform 400ms spring(14, 180),
    opacity 250ms ease-out;
}
```

```tsx
import { Text, VStack, styles } from 'kuito';

const sheet = styles({
  card: { padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 },
});

<VStack class={sheet.card}>
  <Text>Card</Text>
</VStack>;
```

`styles()` initializes a `const` wherever one can be declared: module scope, a
component body, a block. The build replaces each call with its class names and
keeps a source map, so breakpoints after a sheet stay on their lines. A
`styles()` call anywhere else is an error at that call.

An element takes its classes through `class`, the CSS name: names from a
`.css` import or `styles()`, as a string of space-separated names or a list
whose falsy entries are skipped. `class` is an expression like any prop: when
a signal it reads changes, the view's branch is planned again with the new
classes, and a prop no class sets any more goes back to its default. A class
made only of a stylesheet's names, strings and literal data attributes
(`css.card`, `[css.card, 'row']`, `[button.base, { tone: 'warm' }]`) can
never change, so the build passes it as it is and the view tracks nothing
for it.

```tsx
import { VStack, signal } from 'kuito';
import css from './card.css';

const selected = signal(false);

<VStack class={[css.card, selected.value && css.selected]} />;
```

### Variants

A class's variants are rules for its data attributes, `.card[data-size=large]`
in a stylesheet and `variants: { <name>: { <value>: { … } } }` in a
`styles()` entry. A class list picks them with an object of data
attributes; a falsy value picks none:

```css
.card {
  padding: 12px;
}

.card[data-size='large'] {
  padding: 24px;
}

.card[data-tone='muted'] {
  opacity: 0.6;
}
```

```tsx
import { Pressable, Text, VStack, signal, styles } from 'kuito';
import css from './card.css';

const big = signal(false);
const tone = signal<'primary' | 'ghost'>('primary');

const button = styles({
  base: {
    padding: '8px 16px',
    borderRadius: 8,
    variants: {
      tone: { primary: { backgroundColor: '#ff5a5f' }, ghost: { borderWidth: 1 } },
    },
  },
});

<VStack class={[css.card, { size: big.value ? 'large' : null }]} />;
<Pressable class={[button.base, { tone: tone.value }]}>
  <Text>Save</Text>
</Pressable>;
```

- A data attribute applies to every class in the list that has the variant,
  wherever it stands in the list; a variant no class in the list has, and a
  value its class lacks, are errors naming what it has.
- A variant wins over its class, `@media` conditions included, as the more
  specific selector does in CSS. Variants hold `@media` and `@platform`
  blocks of their own.
- Two variants of a class may apply at once and neither is more specific,
  so two of different names that set the same prop are a build error naming
  both. Values of one name never apply together and may set the same props.
- A rule takes one data attribute with a value (`.card[data-size=large]`);
  an attribute without one, one that is not `data-`, two attributes and an
  attribute without a class are errors.

### The `style` prop

A primitive also takes its own styles, `style={{ … }}`, with the same
camelCase properties and values as `styles()`. The compiler writes each
literal declaration as the native props it means, so nothing parses on the
device. A declaration whose value changes must name one native prop
(`opacity`, `paddingTop`, `backgroundColor`), which then follows its
signals like any prop; a shorthand with an expression (`border: x.value`) is
a build error that names the props to set instead.

```tsx
import { Box, signal } from 'kuito';

const dim = signal(false);

<Box style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }} />;
```

`style` wins over `class` for the props both set. Share styles with `class`;
keep `style` for what one view alone needs.

Lengths accept `px`/`dp` (native points), `rem` and `em` — see
[CSS units](css-units.md). Unknown properties and unsupported values fail the
build with the file, line and reason.

## Values

The compiler reads a stylesheet as CSS does: strings and parentheses hold
`;`, `{` and `}` as text (`font-family: "A;B"`, `url(data:…)`), comments may
sit anywhere, and an unterminated string, comment, block or parenthesis is an
error at the line where it opens.

- **Later wins.** Declarations apply in source order, and every shorthand
  writes its longhands: `padding` the four sides, `gap` both gaps, `border`
  the width and color. So `padding: 4px; padding-top: 8px` keeps the 8px top,
  and `padding-top: 8px; padding: 4px` replaces it, as in CSS. The same holds
  across classes: the later class in `class` wins.
- **Ranges.** `opacity` takes 0–1. Padding, sizes (`width`, `height`, `min-*`,
  `max-*`, `flex-basis`), gaps, `border-width`, `border-radius`, `font-size`,
  `line-height`, shadow radii and blur are never negative; margins, insets,
  translations and `letter-spacing` may be.
- **Borders.** `border` takes a width, the `solid` style and a color, each at
  most once and in any order (`border: solid red 2px`). Other styles are
  errors.

### Colors

Every color compiles to hex, the one notation both renderers parse, so the
device never reads CSS color syntax:

| Written                                         | Compiled               |
| ----------------------------------------------- | ---------------------- |
| `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`         | as written, lower case |
| a CSS named color (`white`, `rebeccapurple`, …) | `#rrggbb`              |
| `transparent`                                   | `#00000000`            |
| `rgb(255 0 0 / 50%)`, `rgba(255, 0, 0, 0.5)`    | `#ff000080`            |
| `hsl(120 100% 50%)`, `hsla(…)`                  | `#00ff00`              |
| `color(srgb 1 0.5 0 / 0.5)`                     | `#ff800080`            |

An unknown name, a malformed hex, a channel out of range and a `color()`
space other than `srgb` are errors. Wide-gamut spaces (`display-p3`) need a
renderer that takes more than hex, which neither has yet.

## Platforms

Each platform gets its own bundle. `platform` is `'ios'` or `'android'`, a
constant the compiler fixes per bundle, so a branch for the other platform
is dead code and leaves the bundle:

```tsx
import { platform } from 'kuito';

const back = platform === 'ios' ? 'chevron.left' : 'arrow_back';
```

Styles branch the same way. An `@platform` block in a stylesheet holds
rules (classes and `:root` tokens), and one in a `styles()` entry holds
declarations; the other platform's bundle never sees them. Their
declarations apply where the block stands, so a later one wins as usual:

```css
.card {
  padding: 16px;
}

@platform android {
  .card {
    padding: 12px;
  }
}
```

```tsx
import { styles } from 'kuito';

const sheet = styles({
  row: { gap: 8, '@platform ios': { gap: 10 } },
});
```

A block names one platform, `ios` or `android`; another name, a block
inside another `@platform`, and a declaration outside a rule are errors.
There is no runtime `Platform.select`.

## Tokens

Custom properties declared in `:root` (or `@tokens`) are tokens: `var(--name)`
is replaced by its value at build time, inside shorthands too. A stylesheet
sees its own tokens and those of the stylesheets it `@import`s:

```css
/* tokens.css */
:root {
  font-size: 16px;
  --accent: #ff5a5f;
  --space: 12px;
}
```

```css
/* card.css */
@import './tokens.css';

.card {
  padding: var(--space);
  border: 1px solid var(--accent);
}
```

- `@import "<path>";` or `@import url(<path>);`, with a path relative to the
  importing file, before every rule. Imports are transitive, and a file
  reached through two imports is read once.
- An import shares tokens and the `:root` font-size, not classes: a component
  that uses `tokens.css` classes imports that module itself.
- A token resolves in the file that declares it: a token in `tokens.css` can
  use the tokens `tokens.css` imports, never those of a file importing it. So
  a token means the same thing everywhere it is used.
- Declaring a token twice in one scope is an error, whether in one file or in
  two imported ones; so is a circular import, a missing file, and a URL or
  absolute path. Each error names the file and line.
- Live Patch watches every imported file: editing `tokens.css` recompiles
  each stylesheet that uses it.
- An app has one `:root` font-size. Declare it in one stylesheet and
  `@import` that one; a second stylesheet in the bundle that declares its own
  is an error naming both lines.

A `:root` block inside `@media (prefers-color-scheme: dark)` (or `light`)
redefines tokens for that scheme, in the file that declares them:

```css
:root {
  --surface: #ffffff;
  --ink: #111114;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface: #121218;
  }
}
```

A prop whose value differs between the schemes, through a token or a token
built from one, compiles to a marker, and the stylesheet installs two static
manifests of the values it stands for. The kernel resolves a marker through
the color scheme (`appearance.colorScheme`, no preference reading as light),
so a theme change re-sends only the props that follow it, in one commit,
planning nothing again. A token the schemes share stays a constant. Only
the color scheme redefines tokens: a `:root` block under any other query is
an error, and so is a scheme's token with no value outside `@media`.

## Conditions

`@media` blocks hold rules whose declarations apply while their query
holds. There is no runtime cascade: each block compiles to an alternate prop
set of its classes, and the kernel picks by system state, sending only the
props that differ when it changes.

```css
.grid {
  padding: 12px;
  flex-direction: column;
}

@media (width-class: expanded) {
  .grid {
    flex-direction: row;
  }
}

@media (min-width: 600px) and (prefers-reduced-motion: no-preference) {
  .grid {
    padding: 24px;
  }
}
```

```tsx
import { styles } from 'kuito';

const sheet = styles({
  row: { gap: 8, '@media (min-width: 600px)': { gap: 16 } },
});
```

| Feature                  | Values                          | Follows                                                      |
| ------------------------ | ------------------------------- | ------------------------------------------------------------ |
| `min-width`, `max-width` | a length in `px`                | the window's width, in points (iOS) or dp (Android)          |
| `width-class`            | `compact`, `medium`, `expanded` | `window.widthClass`: under 600, under 840, and wider         |
| `prefers-color-scheme`   | `light`, `dark`                 | `appearance.colorScheme`; no preference reads as light       |
| `prefers-reduced-motion` | `reduce`, `no-preference`       | `accessibility.reduceMotion`; unknown reads as no-preference |

- A query is features in parentheses joined by `and`. Media types (`screen`),
  `not`, `or`, lists and nested `@media` blocks are errors; so is a feature
  named twice and an unknown feature or value.
- A condition's declarations win over its class's own while it holds,
  whatever their order; a later class in `class` wins over both. A view's own
  props and `style` win over every class.
- A prop only a condition sets goes back to its default when the condition
  stops holding.
- `font-size` cannot change with a condition or a theme: children inherit
  the size their parent is planned with. Give each case a class of its own.
- A view follows only the system state its classes' props read: a class
  with no token or condition makes it follow nothing.
- `@platform` blocks are decided per bundle ([platforms](#platforms)) and
  may hold `@media` blocks, and the other way round.

## Properties

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

## Layout

Kuito lays out with CSS flexbox and absolute positioning. The engine
(`native/shared/layout`) is a C++ port of [Taffy](https://github.com/DioxusLabs/taffy)'s
flexbox algorithm, MIT licensed and credited in `native/shared/layout/LICENSE-taffy`.
It runs Taffy's own conformance suite: 2,656 fixtures whose expected layouts come
from Chrome (`test/flex-conformance.test.ts`). UIKit and Android Views only receive
the frames it computes, so a tree lays out identically on iOS and Android.

Layout is incremental, as in Taffy: results persist between passes, and a change
re-lays out only the node it touches and that node's ancestors. Layout props, insets and tree
edits mark their node; so do the props that can change a text, control or list's
content size (text, font, placeholder, rows), declared in their prop tables. A paint
prop (color, opacity, alignment) leaves the layout as it is, and a sibling's text is
never measured again because an image arrived elsewhere. A hidden subtree lays out as zeros, as in Taffy, but its texts keep their
measurements, so showing a screen again asks the platform to measure nothing.

Each node keeps a fixed set of cached results, Taffy's slots, so a viewport that changes on
every pass (a resize, the keyboard) replaces entries instead of adding them.

A layout prop the UI thread drives (a motion value given to `width`) does not wait for
the screen's pass: it lays out at once, in the frame the UI thread builds, and only the
subtree of the nearest ancestor that sizes exactly as before for everything its parent
asks of it, typically a box with a set width and height. Nothing above that ancestor
lays out, and only its subtree's views move. When no ancestor below the screen
qualifies (every box up to the screen wraps its content), the screen lays out as for
any other change. This is Kuito's addition to Taffy (`Node::relayout`); the conformance
suite also resizes every node of every fixture this way and compares each result with
a layout from scratch.

Every container is a flex container, and sizing follows CSS exactly:

| Property                                                        | Values                                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `flex-direction`, `flex-wrap`, `flex-flow`                      | `row`, `column`, `row-reverse`, `column-reverse`; `nowrap`, `wrap`, `wrap-reverse`, `balance`                                        |
| `flex`, `flex-grow`, `flex-shrink`, `flex-basis`                | as CSS (`flex: 1` is `1 1 0%`, `flex: none`, `flex: 2 0 120px`); JSX `flex={n}` is React Native's                                    |
| `justify-content`, `align-content`                              | `flex-start`, `flex-end`, `start`, `end`, `center`, `stretch`, `space-between`, `space-around`, `space-evenly`, with `safe`/`unsafe` |
| `align-items`, `align-self`                                     | `flex-start`, `flex-end`, `start`, `end`, `self-start`, `self-end`, `center`, `baseline`, `stretch`, with `safe`/`unsafe`            |
| `gap`, `row-gap`, `column-gap`                                  | length or percentage; `gap: <row> <column>`                                                                                          |
| `width`, `height`, `min-*`, `max-*`                             | length, percentage, `auto`, `min-content`, `max-content`, `fit-content`, `fit-content(<length>)`, `stretch`                          |
| `aspect-ratio`                                                  | `16 / 9` or a number                                                                                                                 |
| `margin` (1–4 values), `margin-*`, `margin-horizontal/vertical` | length, percentage or `auto` (auto margins absorb free space, as in CSS)                                                             |
| `position`, `top`, `right`, `bottom`, `left`, `inset`           | `relative` (insets offset the box) or `absolute`; length, percentage or `auto`                                                       |
| `padding`, `border-width`                                       | inset the content box; percentages resolve against the containing block's width                                                      |
| `box-sizing`                                                    | `border-box` (default) or `content-box`                                                                                              |
| `overflow`                                                      | `visible`, `hidden`, `clip`, `scroll`; hidden and scroll also clip                                                                   |
| `direction`                                                     | `ltr` or `rtl`: rows run right to left, and start/end flip; inherited ([Right to left](#right-to-left))                              |
| `flex-line-count`                                               | the minimum number of lines a wrapping container uses (CSS Flexbox 2)                                                                |

Things that follow from CSS and surprise people coming from React Native:

- `flex-shrink` defaults to 1, so an item with an explicit size still shrinks
  when its line overflows. Give it `flex-shrink: 0` to keep it.
- A flex item's automatic minimum size is its content: text does not shrink
  below its longest word, a container not below its children. `overflow:
  hidden` (or `min-width: 0`) lets it shrink further.
- `align-items: stretch` stretches only children without an explicit cross size.
- Percentages resolve against the containing block; padding and margins
  against its width, on every side.

Kuito differs from the web in one place: like React Native, every view is the
containing block of its `position: absolute` children, so insets are relative
to the parent's padding box, whatever the parent's own `position`.

Each view kind starts from defaults:

| View                          | Direction | Defaults                                                                   |
| ----------------------------- | --------- | -------------------------------------------------------------------------- |
| `VStack`, `Box`, `Pressable`  | column    |                                                                            |
| `HStack`                      | row       | `align-items: center`                                                      |
| `Scroll`                      | column    | `flex-grow: 1` and a scroll container: fills the space its parent has left |
| `Scroll horizontal`           | row       | the same, scrolling sideways                                               |
| `Spacer`                      | —         | `flex-grow: 1`: takes the free space along its parent                      |
| `Divider`                     | —         | at least 1pt tall                                                          |
| `Button`, `Toggle`, `Spinner` | —         | `flex-shrink: 0`: controls overflow rather than squash                     |

A scroll view lays its children out without limit along its axis and scrolls
the overflow. `display: none` (`hidden`) removes a view from layout.
Frames are rounded to device pixels, so neighbours never gap or overlap. A
view the platform measures (text, a control) keeps the pixels it measured
wherever it lands, as Yoga rounds text: rounding its edges alone could take
one off and wrap its last word, so its far edge may overlap a neighbour by a
pixel instead.

The root views stack in a column that fills the whole screen, edge to edge
on both platforms as in React Native: content can draw under the status bar,
notch and home indicator. Wrap content in a `SafeArea` to keep it clear of
them. A root Scroll takes the full height.

Not supported: block and grid layout, floats, vertical writing modes, and
CSS's static positioning (an absolute box always belongs to its parent).

### Right to left

The app lays out in the direction of the user's first language, the
`textDirection` of `localization.locales[0]` ([localization](localization.md)):
Arabic or Hebrew first, rows run right to left. `direction` inherits as in
CSS, so a view without one takes its parent's, and a screen, tab, sheet or
list row takes the direction of the view that shows it. Set `direction: ltr`
on an app's outer view to keep an untranslated app left to right.

Logical properties name the side lines start from instead of left or right:

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

- `padding-inline`, `margin-inline` and `inset-inline` take a start and an
  optional end; each side has its longhand (`padding-inline-start`, …). They
  stay logical until layout, which resolves them against the view's own
  direction, so a change of direction moves them.
- A logical side wins over the physical side it lands on: `padding-left` and
  `padding-inline-start` on one view in `ltr` pad by the logical one, whatever
  their order. CSS takes the later declaration instead.
- The block sides (`padding-block`, `margin-block-start`, `inset-block-end`,
  …) are `top` and `bottom`: Kuito has only horizontal writing.
- Borders have no logical sides: a border is one width and color all around.
- `text-align` does not follow `direction`: `start` and `end` compile to
  `left` and `right`.
- Native views keep their own direction: a horizontal Scroll or List still
  starts at its left end, and controls, text fields and the tab bar do not
  mirror.

A NavigationStack follows its own direction: in `rtl`, screens come in from
the left and the back swipe starts at the right edge on iOS; on Android the
pages slide the other way, while the header keeps its back arrow on the
left ([navigation](navigation.md)).

## Transitions

`transition` lists properties with a duration, a timing function and a delay,
like CSS:

```css
transition:
  transform 400ms spring(14, 180),
  opacity 250ms ease-out 50ms;
```

- Animatable properties: `opacity`, `background-color`, `transform` (all
  transform props), `border-radius`, `border-color`, `box-shadow` (all four
  shadow props), `width`, `height` and `all`. A width or height moves only
  between numbers: a change to or from a percentage or `auto` applies at once.
- Timing functions: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`,
  `cubic-bezier(x1, y1, x2, y2)`, and `spring(damping, stiffness[, mass])`
  (a spring ignores the duration; its second time is the delay).
- Animations run on the UI thread, in the motion value runner
  ([Motion](motion.md#animated-props-animate-and-transition)); JavaScript only sends the target values.

## Platform notes

Both renderers apply every property above; where a platform cannot match
CSS exactly, it degrades as follows.

- **Clipping.** Like CSS, children draw outside their parent unless
  `overflow: hidden` (Android's default clipping is turned off). On iOS a
  rounded view clips its content unless it has a shadow; `overflow: hidden`
  always clips, which also hides the shadow.
- **Radii.** `border-radius` is clamped to half the view's size, so `999px`
  makes a pill on both platforms.
- **Shadows.** iOS uses the full offset, blur and color. Android draws
  elevation shadows: the blur maps to elevation, the color applies on
  Android 9+, and the offset is ignored (the light source is fixed), so an
  animated offset moves nothing there.
- **Gradients.** iOS uses any angle; Android snaps to the nearest 45°.
- **Layout.** Identical on both platforms (one engine). Native controls
  keep their platform size: Android's Material buttons are wider than
  UIKit's and may overflow a row that fits on iOS. Text's min-content width
  is its widest word, measured with the platform's font once per text and
  font, then kept until either changes. The platforms split words a little
  differently: iOS takes its words (`byWords`), which leave punctuation
  out; Android takes the runs its line breaker may wrap between
  (`BreakIterator.getLineInstance`), so punctuation stays with its word
  (`Total:`), a hyphen ends one (`well-` `known`) and each CJK ideograph is
  a run of its own. Those runs follow the device's language, so a language
  change measures every text again.
- **Typography.** Numeric font weights and `line-height` need Android 9+;
  earlier versions fall back to regular/bold and the default line height.
  Bundled and loaded families pick their files by weight on every version
  ([fonts](fonts.md#how-fontfamily-resolves)); an unknown `font-family` is an
  error naming it.

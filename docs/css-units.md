# CSS length units in Kuito

Kuito accepts familiar **`px`**, **`rem`**, and **`em`** in `.css` files for native length properties (`width`, `height`, `min-`/`max-` sizes, `padding` and its sides, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, translations and shadows). The full list is in [Native styles](styles.md).

```css
:root {
  font-size: 18px;
  --space: 1rem;
}

.card {
  font-size: 1.25rem; /* 22.5 native logical units */
  padding: 2em; /* 45 units = element font size × 2 */
  gap: var(--space); /* 18 units */
  border-radius: 12px; /* 12 native logical units */
}

.caption {
  font-size: 0.875em;
} /* relative to inherited font size */
```

## Compilation rules

- **`px`** is a _CSS logical pixel_, compiled to one layout point on iOS or density-independent pixel on Android—not a physical screen pixel.
- **`rem`** is multiplied at build time by the root font size. Default: `16px`. Override with `:root { font-size: 18px; }` or the compiler's `rootFontSize` option. An app has one root font size: declare it in one stylesheet and `@import` that one where `rem` should follow it; a second declaration elsewhere in the bundle is an error.
- **`em`** is compiled into a compact numeric font-relative instruction. Kuito resolves it when preparing the native view plan: `font-size: Nem` is relative to the inherited parent size; other `em` dimensions are relative to the element's computed font size.
- **Unitless lengths and `dp`** remain accepted for compatibility with existing Kuito styles.
- **`transition`** times accept `ms` and `s` (normalized to milliseconds). **`opacity`** is unitless.
- **`var(--token)`** resolves at build time, including forward references and chains. Missing or circular tokens produce explicit compiler errors. Tokens from an `@import`ed stylesheet, including its `:root` font-size, apply too ([Tokens](styles.md#tokens)).
- **`%`** is accepted where layout resolves it against the parent: `width`, `height`, their `min-`/`max-` forms, `flex-basis`, `margin`, the insets (`top`, `inset`, ...) and `gap`. It crosses to native as text (`"50%"`) and the layout engine resolves it. `padding`, borders and text lengths take no `%`.
- Unsupported dimensions (`vh`, `vw`, `calc()` and others) fail compilation rather than being silently discarded.

## Implementation boundary

Stylesheets compile into native numeric properties plus pre-parsed `em` instructions. Neither Hermes nor the native UI thread parses `.css` text. Relative instructions are multiplied by computed font size during view planning; platform adapters receive only scalar numbers.

**Current limitation:** Native font inheritance and `em` are recomputed during initial rendering and compatible Live Patch, but changing an ancestor's font size through a signal does not yet automatically recompute all descendant `em` measurements. Dynamic tokens beyond the color scheme's, the full browser cascade and system Dynamic Type scaling also remain separate work. `@media` conditions on width, width class, color scheme and reduced motion are supported ([Conditions](styles.md#conditions)). Avoid assuming complete browser CSS compatibility.

See `src/style/compiler.ts`, `src/runtime/plan-values.ts` and `test/css-units.test.ts`.

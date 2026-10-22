# CSS units

Kuito accepts `px`, `rem` and `em` in `.css` files for native length properties: `width`, `height`, `min-`/`max-` sizes, `padding` and its sides, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, translations and shadows.

```css
:root {
  font-size: 18px;
  --space: 1rem;
}

.card {
  font-size: 1.25rem; /* 22.5 native logical units */
  padding: 2em; /* 45 units = element font size x 2 */
  gap: var(--space); /* 18 units */
  border-radius: 12px; /* 12 native logical units */
}
```

## px, rem and em

- `px` is a CSS logical pixel, compiled to one layout point on iOS or density-independent pixel on Android, not a physical screen pixel.
- `rem` is multiplied at build time by the root font size. Default: `16px`. Override with `:root { font-size: 18px; }` or the compiler's `rootFontSize` option. An app has one root font size: declare it in one stylesheet and `@import` that one where `rem` should follow it; a second declaration elsewhere in the bundle is an error.
- `em` is resolved when preparing the native view plan: `font-size: Nem` is relative to the inherited parent size; other `em` dimensions are relative to the element's computed font size.
- Unitless lengths and `dp` remain accepted.

```css
.caption {
  font-size: 0.875em; /* relative to inherited font size */
}
```

## Other values

- `transition` times accept `ms` and `s` (normalized to milliseconds). `opacity` is unitless.
- `var(--token)` resolves at build time, including forward references and chains. Missing or circular tokens produce explicit compiler errors. Tokens from an `@import`ed stylesheet, including its `:root` font-size, apply too ([Tokens](../../../../docs/styles.md#tokens)).
- Unsupported dimensions (`%`, `vh`, `vw`, `calc()` and others) fail compilation rather than being silently discarded.

## Limitations

Neither Hermes nor the native UI thread parses `.css` text; platform adapters receive only scalar numbers. Changing an ancestor's font size through a signal does not yet automatically recompute all descendant `em` measurements. Do not assume complete browser CSS compatibility.

## In depth

[CSS length units](../../../../docs/css-units.md) covers the implementation boundary between the compiler and view planning, and the work that remains separate.

# Choose layout and font units

Use px for native logical dimensions, rem for a shared scale and em for spacing
relative to text. A CSS pixel is one iOS layout point or Android dp, not one
physical display pixel.

## Size a card around its typography

```css
:root {
  font-size: 18px;
  --space: 1rem;
}
.card {
  font-size: 1.25rem;
  padding: 2em;
  gap: var(--space);
  border-radius: 12px;
}
.caption {
  font-size: 0.875em;
}
```

The card font is 22.5 logical units, padding is 45 and gap is 18. Its caption
font uses the inherited font size as its base.

| Unit                        | Meaning                           | Use case                                  |
| --------------------------- | --------------------------------- | ----------------------------------------- |
| `px`, `dp`, unitless length | Native logical units              | Borders and fixed spacing                 |
| `rem`                       | Root font size; 16 by default     | A shared size scale                       |
| `em` in font-size           | Inherited font size               | Relative headings and captions            |
| `em` elsewhere              | This element's computed font size | Padding around text                       |
| `%`                         | Containing layout dimension       | Widths, heights, margins, gaps and insets |

Declare one root font size for the bundle and import that stylesheet where
needed. Multiple declarations in different stylesheets are errors. Percentages
are not accepted for padding, borders or text dimensions. vh, vw and calc are
not supported.

## Separate font units from system text scaling

Native text follows the user's text-size setting. rem is a build-time scale;
it is not a second Dynamic Type multiplier. em is resolved when the view plan
is prepared. Changing an ancestor's font size through a signal does not yet
recompute every descendant em measurement automatically.

Use ms or s for transition time, angles for rotation, and unitless opacity in
the range 0–1. See [styling](styles.md) for properties and conditional rules.

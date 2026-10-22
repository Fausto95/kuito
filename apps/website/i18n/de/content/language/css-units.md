# CSS-Einheiten

Kuito akzeptiert `px`, `rem` und `em` in `.css`-Dateien für native Längeneigenschaften: `width`, `height`, `min-`/`max-`-Größen, `padding` und seine Seiten, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, Verschiebungen und Schatten.

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

## px, rem und em

- `px` ist ein logischer CSS-Pixel, kompiliert zu einem Layout-Punkt auf iOS oder einem dichteunabhängigen Pixel auf Android, nicht zu einem physischen Bildschirmpixel.
- `rem` wird zur Build-Zeit mit der Root-Schriftgröße multipliziert. Standard: `16px`. Überschreiben mit `:root { font-size: 18px; }` oder der Compiler-Option `rootFontSize`. Eine App hat eine Root-Schriftgröße: sie in einem Stylesheet deklarieren und dieses überall per `@import` einbinden, wo `rem` ihr folgen soll; eine zweite Deklaration an anderer Stelle im Bundle ist ein Fehler.
- `em` wird beim Erstellen des nativen View-Plans aufgelöst: `font-size: Nem` ist relativ zur geerbten Größe des Elternelements; andere `em`-Maße sind relativ zur berechneten Schriftgröße des Elements.
- Einheitenlose Längen und `dp` bleiben zulässig.

```css
.caption {
  font-size: 0.875em; /* relative to inherited font size */
}
```

## Andere Werte

- `transition`-Zeiten akzeptieren `ms` und `s` (normalisiert auf Millisekunden). `opacity` ist einheitenlos.
- `var(--token)` wird zur Build-Zeit aufgelöst, einschließlich Vorwärtsreferenzen und Ketten. Fehlende oder zirkuläre Tokens erzeugen explizite Compiler-Fehler. Tokens aus einem per `@import` eingebundenen Stylesheet gelten ebenfalls, einschließlich seiner `:root`-Schriftgröße ([Tokens](../../../../docs/styles.md#tokens)).
- Nicht unterstützte Maße (`%`, `vh`, `vw`, `calc()` und andere) lassen die Kompilierung fehlschlagen, statt stillschweigend verworfen zu werden.

## Einschränkungen

Weder Hermes noch der native UI-Thread parst `.css`-Text; Plattform-Adapter erhalten nur skalare Zahlen. Eine Änderung der Schriftgröße eines Vorfahren über ein Signal berechnet noch nicht automatisch alle `em`-Maße der Nachfahren neu. Vollständige Browser-CSS-Kompatibilität nicht voraussetzen.

## Vertiefung

[CSS-Längeneinheiten](../../../../docs/css-units.md) behandelt die Implementierungsgrenze zwischen Compiler und View-Planung und die Arbeit, die separat bleibt.

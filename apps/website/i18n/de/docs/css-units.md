# CSS-Längeneinheiten in Kuito

Kuito akzeptiert die vertrauten **`px`**, **`rem`** und **`em`** in `.css`-Dateien für native Längeneigenschaften (`width`, `height`, `min-`/`max-`-Größen, `padding` und seine Seiten, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, Verschiebungen und Schatten). Die vollständige Liste steht in [Native Styles](styles.md).

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

## Kompilierungsregeln

- **`px`** ist ein _logischer CSS-Pixel_, der zu einem Layout-Punkt auf iOS bzw. einem dichteunabhängigen Pixel auf Android kompiliert wird—nicht zu einem physischen Bildschirmpixel.
- **`rem`** wird zur Build-Zeit mit der Root-Schriftgröße multipliziert. Standard: `16px`. Überschreiben mit `:root { font-size: 18px; }` oder der Compiler-Option `rootFontSize`. Eine App hat eine Root-Schriftgröße: Sie wird in einem Stylesheet deklariert, und dieses wird überall dort per `@import` eingebunden, wo `rem` ihr folgen soll; eine zweite Deklaration an anderer Stelle im Bundle ist ein Fehler.
- **`em`** wird in eine kompakte numerische schriftrelative Anweisung kompiliert. Kuito löst sie beim Erstellen des nativen View-Plans auf: `font-size: Nem` ist relativ zur geerbten Größe des Elternelements; andere `em`-Maße sind relativ zur berechneten Schriftgröße des Elements.
- **Einheitenlose Längen und `dp`** bleiben aus Kompatibilität mit bestehenden Kuito-Styles zulässig.
- **`transition`**-Zeiten akzeptieren `ms` und `s` (normalisiert auf Millisekunden). **`opacity`** ist einheitenlos.
- **`var(--token)`** wird zur Build-Zeit aufgelöst, einschließlich Vorwärtsreferenzen und Ketten. Fehlende oder zirkuläre Tokens erzeugen explizite Compiler-Fehler. Tokens aus einem per `@import` eingebundenen Stylesheet gelten ebenfalls, einschließlich seiner `:root`-Schriftgröße ([Tokens](styles.md#tokens)).
- Nicht unterstützte Maße (`%`, `vh`, `vw`, `calc()` und andere) lassen die Kompilierung fehlschlagen, statt stillschweigend verworfen zu werden.

## Implementierungsgrenze

Stylesheets werden zu nativen numerischen Eigenschaften plus vorab geparsten `em`-Anweisungen kompiliert. Weder Hermes noch der native UI-Thread parst `.css`-Text. Relative Anweisungen werden während der View-Planung mit der berechneten Schriftgröße multipliziert; Plattform-Adapter erhalten nur skalare Zahlen.

**Aktuelle Einschränkung:** Native Schriftvererbung und `em` werden beim initialen Rendern und bei einem kompatiblen Live Patch neu berechnet, aber eine Änderung der Schriftgröße eines Vorfahren über ein Signal berechnet noch nicht automatisch alle `em`-Maße der Nachfahren neu. CSS-Media-Queries, dynamische Tokens, die vollständige Browser-Kaskade und die Dynamic-Type-Skalierung des Systems bleiben ebenfalls separate Arbeit. Vollständige Browser-CSS-Kompatibilität sollte nicht vorausgesetzt werden.

Siehe `src/style/compiler.ts`, `src/runtime/plan-values.ts` und `test/css-units.test.ts`.

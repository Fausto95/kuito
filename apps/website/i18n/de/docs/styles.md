# Native Styles

Kuito kompiliert Styles zur Build-Zeit in native Eigenschaften. `.css`-Module und
`styles({...})` teilen sich eine Eigenschaftstabelle (`src/style/properties.ts`): CSS
verwendet kebab-case-Namen, `styles()` camelCase, und beide akzeptieren dieselben Werte,
einschließlich Kurzschreibweisen als Strings. Nichts parst CSS auf dem Gerät.

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
const sheet = styles({
  card: { padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 },
});
```

`styles()` initialisiert eine `const`, wo immer eine deklariert werden kann: auf
Modulebene, in einem Komponentenrumpf, in einem Block. Der Build ersetzt jeden Aufruf durch
seine Klassennamen und behält eine Source Map, sodass Breakpoints nach einem Sheet auf
ihren Zeilen bleiben. Ein `styles()`-Aufruf an jeder anderen Stelle ist ein Fehler an
diesem Aufruf.

Ein Element erhält seine Klassen über `class`, den CSS-Namen: Namen aus einem
`.css`-Import oder `styles()`, als String aus durch Leerzeichen getrennten Namen oder als
Liste, deren falsy Einträge übersprungen werden. `class` ist ein Ausdruck wie jede Prop:
Wenn sich ein Signal ändert, das er liest, wird der Zweig der View mit den neuen Klassen
neu geplant, und eine Prop, die keine Klasse mehr setzt, kehrt zu ihrem Standard zurück.
Eine Klasse, die nur aus Namen eines Stylesheets, Strings und literalen Datenattributen
besteht (`css.card`, `[css.card, 'row']`, `[button.base, { tone: 'warm' }]`), kann sich
nie ändern, daher reicht der Build sie unverändert durch, und die View verfolgt nichts für
sie.

```tsx
import css from './card.css';

<VStack class={[css.card, selected.value && css.selected]} />;
```

### Varianten

Die Varianten einer Klasse sind Regeln für ihre Datenattribute, `.card[data-size=large]`
in einem Stylesheet und `variants: { <name>: { <value>: { … } } }` in einem
`styles()`-Eintrag. Eine Klassenliste wählt sie mit einem Objekt aus Datenattributen aus;
ein falsy Wert wählt keine:

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
<Pressable class={[button.base, { tone: tone.value }]}>...</Pressable>;
```

- Ein Datenattribut gilt für jede Klasse in der Liste, die die Variante hat, wo auch immer
  sie in der Liste steht; eine Variante, die keine Klasse in der Liste hat, und ein Wert,
  den ihre Klasse nicht kennt, sind Fehler, die benennen, was sie hat.
- Eine Variante gewinnt über ihre Klasse, `@media`-Bedingungen eingeschlossen, so wie der
  spezifischere Selektor in CSS. Varianten enthalten eigene `@media`- und
  `@platform`-Blöcke.
- Zwei Varianten einer Klasse können gleichzeitig gelten, und keine ist spezifischer,
  daher sind zwei mit verschiedenen Namen, die dieselbe Prop setzen, ein Build-Fehler, der
  beide benennt. Werte eines Namens gelten nie zusammen und dürfen dieselben Props setzen.
- Eine Regel nimmt ein Datenattribut mit einem Wert (`.card[data-size=large]`); ein
  Attribut ohne Wert, eines, das nicht `data-` ist, zwei Attribute und ein Attribut ohne
  Klasse sind Fehler.

### Die `style`-Prop

Ein Primitiv nimmt auch eigene Styles entgegen, `style={{ … }}`, mit denselben
camelCase-Eigenschaften und Werten wie `styles()`. Der Compiler schreibt jede literale
Deklaration als die nativen Props, die sie bedeutet, sodass nichts auf dem Gerät parst.
Eine Deklaration, deren Wert sich ändert, muss eine native Prop benennen (`opacity`,
`paddingTop`, `backgroundColor`), die dann wie jede Prop ihren Signalen folgt; eine
Kurzschreibweise mit einem Ausdruck (`border: x.value`) ist ein Build-Fehler, der die
stattdessen zu setzenden Props benennt.

```tsx
<Box style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }} />
```

`style` gewinnt über `class` bei den Props, die beide setzen. Styles werden über `class`
geteilt; `style` bleibt dem vorbehalten, was eine einzelne View allein braucht.

Längen akzeptieren `px`/`dp` (native Punkte), `rem` und `em` — siehe
[CSS-Einheiten](css-units.md). Unbekannte Eigenschaften und nicht unterstützte Werte lassen
den Build fehlschlagen, mit Datei, Zeile und Grund.

## Werte

Der Compiler liest ein Stylesheet so wie CSS: Strings und Klammern enthalten `;`, `{` und
`}` als Text (`font-family: "A;B"`, `url(data:…)`), Kommentare dürfen überall stehen, und
ein nicht abgeschlossener String, Kommentar, Block oder eine nicht geschlossene Klammer ist
ein Fehler an der Zeile, an der er bzw. sie öffnet.

- **Späteres gewinnt.** Deklarationen gelten in Quellreihenfolge, und jede
  Kurzschreibweise schreibt ihre Langformen: `padding` die vier Seiten, `gap` beide
  Abstände, `border` die Breite und die Farbe. So behält `padding: 4px; padding-top: 8px`
  die 8px oben, und `padding-top: 8px; padding: 4px` ersetzt sie, wie in CSS. Dasselbe
  gilt über Klassen hinweg: Die spätere Klasse in `class` gewinnt.
- **Bereiche.** `opacity` nimmt 0–1. Padding, Größen (`width`, `height`, `min-*`,
  `max-*`, `flex-basis`), Abstände, `border-width`, `border-radius`, `font-size`,
  `line-height`, Schattenradien und Unschärfe sind nie negativ; Margins, Insets,
  Verschiebungen und `letter-spacing` dürfen es sein.
- **Rahmen.** `border` nimmt eine Breite, den Stil `solid` und eine Farbe, jeweils
  höchstens einmal und in beliebiger Reihenfolge (`border: solid red 2px`). Andere Stile
  sind Fehler.

### Farben

Jede Farbe kompiliert zu Hex, der einen Notation, die beide Renderer parsen, sodass das
Gerät nie CSS-Farbsyntax liest:

| Geschrieben                                           | Kompiliert                          |
| ----------------------------------------------------- | ----------------------------------- |
| `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`               | wie geschrieben, in Kleinbuchstaben |
| eine benannte CSS-Farbe (`white`, `rebeccapurple`, …) | `#rrggbb`                           |
| `transparent`                                         | `#00000000`                         |
| `rgb(255 0 0 / 50%)`, `rgba(255, 0, 0, 0.5)`          | `#ff000080`                         |
| `hsl(120 100% 50%)`, `hsla(…)`                        | `#00ff00`                           |
| `color(srgb 1 0.5 0 / 0.5)`                           | `#ff800080`                         |

Ein unbekannter Name, ein fehlerhaftes Hex, ein Kanal außerhalb des Bereichs und ein
`color()`-Farbraum außer `srgb` sind Fehler. Wide-Gamut-Farbräume (`display-p3`) brauchen
einen Renderer, der mehr als Hex entgegennimmt, was noch keiner tut.

## Plattformen

Jede Plattform erhält ihr eigenes Bundle. `platform` ist `'ios'` oder `'android'`, eine
Konstante, die der Compiler pro Bundle festlegt, sodass ein Zweig für die andere Plattform
toter Code ist und das Bundle verlässt:

```tsx
import { platform } from 'kuito';

const back = platform === 'ios' ? 'chevron.left' : 'arrow_back';
```

Styles verzweigen auf dieselbe Weise. Ein `@platform`-Block in einem Stylesheet enthält
Regeln (Klassen und `:root`-Tokens), und einer in einem `styles()`-Eintrag enthält
Deklarationen; das Bundle der anderen Plattform sieht sie nie. Ihre Deklarationen gelten
dort, wo der Block steht, sodass wie üblich eine spätere gewinnt:

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
const sheet = styles({
  row: { gap: 8, '@platform ios': { gap: 10 } },
});
```

Ein Block benennt eine Plattform, `ios` oder `android`; ein anderer Name, ein Block
innerhalb eines anderen `@platform` und eine Deklaration außerhalb einer Regel sind Fehler.
Es gibt kein `Platform.select` zur Laufzeit.

## Tokens

In `:root` (oder `@tokens`) deklarierte Custom Properties sind Tokens: `var(--name)` wird
zur Build-Zeit durch seinen Wert ersetzt, auch innerhalb von Kurzschreibweisen. Ein
Stylesheet sieht seine eigenen Tokens und die der Stylesheets, die es per `@import`
einbindet:

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

- `@import "<path>";` oder `@import url(<path>);`, mit einem Pfad relativ zur
  importierenden Datei, vor jeder Regel. Imports sind transitiv, und eine Datei, die über
  zwei Imports erreicht wird, wird einmal gelesen.
- Ein Import teilt Tokens und die `:root`-Schriftgröße, keine Klassen: Eine Komponente,
  die Klassen aus `tokens.css` verwendet, importiert dieses Modul selbst.
- Ein Token wird in der Datei aufgelöst, die es deklariert: Ein Token in `tokens.css` kann
  die Tokens verwenden, die `tokens.css` importiert, nie die einer Datei, die es
  importiert. So bedeutet ein Token überall dasselbe, wo es verwendet wird.
- Ein Token zweimal in einem Geltungsbereich zu deklarieren ist ein Fehler, ob in einer
  Datei oder in zwei importierten; ebenso ein zirkulärer Import, eine fehlende Datei und
  eine URL oder ein absoluter Pfad. Jeder Fehler benennt Datei und Zeile.
- Live Patch beobachtet jede importierte Datei: Das Bearbeiten von `tokens.css` kompiliert
  jedes Stylesheet neu, das es verwendet.
- Eine App hat eine `:root`-Schriftgröße. Sie wird in einem Stylesheet deklariert, und
  dieses wird per `@import` eingebunden; ein zweites Stylesheet im Bundle, das seine eigene
  deklariert, ist ein Fehler, der beide Zeilen benennt.

Ein `:root`-Block innerhalb von `@media (prefers-color-scheme: dark)` (oder `light`)
definiert Tokens für dieses Schema neu, in der Datei, die sie deklariert:

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

Eine Prop, deren Wert sich zwischen den Schemata unterscheidet, über ein Token oder ein aus
einem Token gebildetes, kompiliert zu einem Marker, und das Stylesheet installiert zwei
statische Manifeste der Werte, für die er steht. Der Kernel löst einen Marker über das
Farbschema auf (`appearance.colorScheme`, keine Präferenz gilt als hell), sodass ein
Themenwechsel nur die Props erneut sendet, die ihm folgen, in einem Commit, ohne etwas neu
zu planen. Ein Token, das sich die Schemata teilen, bleibt eine Konstante. Nur das
Farbschema definiert Tokens neu: Ein `:root`-Block unter einer anderen Query ist ein
Fehler, ebenso ein Token eines Schemas ohne Wert außerhalb von `@media`.

## Bedingungen

`@media`-Blöcke enthalten Regeln, deren Deklarationen gelten, solange ihre Query zutrifft.
Es gibt keine Kaskade zur Laufzeit: Jeder Block kompiliert zu einem alternativen Prop-Satz
seiner Klassen, und der Kernel wählt anhand des Systemzustands aus und sendet nur die
Props, die sich unterscheiden, wenn er sich ändert.

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
const sheet = styles({
  row: { gap: 8, '@media (min-width: 600px)': { gap: 16 } },
});
```

| Feature                  | Werte                           | Folgt                                                          |
| ------------------------ | ------------------------------- | -------------------------------------------------------------- |
| `min-width`, `max-width` | eine Länge in `px`              | der Fensterbreite, in Punkten (iOS) oder dp (Android)          |
| `width-class`            | `compact`, `medium`, `expanded` | `window.widthClass`: unter 600, unter 840 und breiter          |
| `prefers-color-scheme`   | `light`, `dark`                 | `appearance.colorScheme`; keine Präferenz gilt als hell        |
| `prefers-reduced-motion` | `reduce`, `no-preference`       | `accessibility.reduceMotion`; unbekannt gilt als no-preference |

- Eine Query besteht aus Features in Klammern, verbunden durch `and`. Medientypen
  (`screen`), `not`, `or`, Listen und verschachtelte `@media`-Blöcke sind Fehler; ebenso
  ein zweimal benanntes Feature sowie ein unbekanntes Feature oder ein unbekannter Wert.
- Die Deklarationen einer Bedingung gewinnen über die eigenen ihrer Klasse, solange sie
  zutrifft, unabhängig von ihrer Reihenfolge; eine spätere Klasse in `class` gewinnt über
  beide. Die eigenen Props einer View und `style` gewinnen über jede Klasse.
- Eine Prop, die nur eine Bedingung setzt, kehrt zu ihrem Standard zurück, wenn die
  Bedingung nicht mehr zutrifft.
- `font-size` kann sich nicht mit einer Bedingung oder einem Theme ändern: Kinder erben
  die Größe, mit der ihr Elternelement geplant wurde. Jeder Fall bekommt eine eigene
  Klasse.
- Eine View folgt nur dem Systemzustand, den die Props ihrer Klassen lesen: Eine Klasse
  ohne Token oder Bedingung lässt sie nichts folgen.
- `@platform`-Blöcke werden pro Bundle entschieden ([Plattformen](#platforms)) und dürfen
  `@media`-Blöcke enthalten, und umgekehrt.

## Eigenschaften

<!-- style properties: generated from src/style/properties.ts -->

| CSS                                                                                                                                                         | Native Props                                                                                                                                                   | Werte                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `background`                                                                                                                                                | `backgroundColor`, `backgroundGradient`                                                                                                                        | Farbe oder `linear-gradient(<angle> \| to <side>, color, color, …)`                               |
| `background-color`, `color`                                                                                                                                 | dieselben, in camelCase                                                                                                                                        | Farbe ([Farben](#colors))                                                                         |
| `opacity`                                                                                                                                                   | dieselbe                                                                                                                                                       | 0–1                                                                                               |
| `padding`                                                                                                                                                   | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                   | 1–4 nicht-negative Längen, wie in CSS                                                             |
| `padding-top`, `padding-right`, `padding-bottom`, `padding-left`, `padding-horizontal`, `padding-vertical`                                                  | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                   | nicht-negative Länge                                                                              |
| `gap`, `row-gap`, `column-gap`, `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`, `aspect-ratio`                                     | `rowGap`, `columnGap`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `aspectRatio`                                                      | siehe [Layout](#layout)                                                                           |
| `overflow`, `direction`, `box-sizing`, `position`, `top`, `right`, `bottom`, `left`, `margin-top`, `margin-right`, `margin-bottom`, `margin-left`           | dieselben, in camelCase                                                                                                                                        | siehe [Layout](#layout)                                                                           |
| `flex-direction`, `flex-wrap`, `flex-grow`, `flex-shrink`, `flex-basis`, `flex-line-count`, `align-items`, `align-self`, `align-content`, `justify-content` | dieselben, in camelCase                                                                                                                                        | siehe [Layout](#layout)                                                                           |
| `inset`, `margin`, `margin-horizontal`, `margin-vertical`, `flex`, `flex-flow`                                                                              | `top`, `right`, `bottom`, `left`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `flexGrow`, `flexShrink`, `flexBasis`, `flexDirection`, `flexWrap` | siehe [Layout](#layout)                                                                           |
| `display`, `hidden`                                                                                                                                         | `hidden`                                                                                                                                                       | `none`, `flex`; `hidden` nimmt `true` oder `false`                                                |
| `border`                                                                                                                                                    | `borderWidth`, `borderColor`                                                                                                                                   | `<width> solid <color>`, in beliebiger Reihenfolge, jeweils höchstens einmal; oder `none`         |
| `border-radius`, `corner-radius`, `border-width`, `border-color`                                                                                            | `borderRadius`, `borderWidth`, `borderColor`                                                                                                                   | nicht-negative Länge / Farbe                                                                      |
| `box-shadow`                                                                                                                                                | `shadowOffsetX`, `shadowOffsetY`, `shadowRadius`, `shadowColor`                                                                                                | `<x> <y> [blur] <color>`; die Unschärfe wird halbiert zum nativen Radius                          |
| `shadow-color`, `shadow-radius`, `shadow-offset-x`, `shadow-offset-y`                                                                                       | dieselben, in camelCase                                                                                                                                        | Farbe / Länge                                                                                     |
| `font-size`, `letter-spacing`                                                                                                                               | dieselben, in camelCase                                                                                                                                        | Länge                                                                                             |
| `line-height`                                                                                                                                               | dieselbe, in camelCase                                                                                                                                         | Länge oder ein einheitenloses Vielfaches der Schriftgröße                                         |
| `font-weight`                                                                                                                                               | dieselbe, in camelCase                                                                                                                                         | `normal`, `bold`, `100`–`900`                                                                     |
| `font-family`, `font-style`                                                                                                                                 | dieselben, in camelCase                                                                                                                                        | eine System-, gebündelte oder geladene Schriftfamilie ([Schriften](fonts.md)); `normal`, `italic` |
| `text-align`, `text-transform`                                                                                                                              | dieselben, in camelCase                                                                                                                                        | `left`/`center`/`right`; `none`/`uppercase`/`lowercase`/`capitalize`                              |
| `-webkit-line-clamp`, `number-of-lines`                                                                                                                     | `lineClamp`                                                                                                                                                    | ganze Zahl (`0` = unbegrenzt)                                                                     |
| `transform`                                                                                                                                                 | `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`                                                                                              | `translate()`, `translateX/Y()`, `scale()`, `scaleX/Y()`, `rotate(deg\|rad\|turn)`, `none`        |
| `translate-x`, `translate-y`, `scale`, `scale-x`, `scale-y`, `rotate`                                                                                       | dieselben, in camelCase                                                                                                                                        | Länge; eine Zahl; ein Winkel (`deg`, `rad`, `turn`)                                               |
| `transition`                                                                                                                                                | dieselbe                                                                                                                                                       | siehe [Transitions](#transitions)                                                                 |

<!-- end of generated style properties -->

## Layout

Kuito layoutet mit CSS-Flexbox und absoluter Positionierung. Die Engine
(`native/shared/layout`) ist ein C++-Port des Flexbox-Algorithmus von
[Taffy](https://github.com/DioxusLabs/taffy), MIT-lizenziert und in
`native/shared/layout/LICENSE-taffy` genannt. Sie führt Taffys eigene Konformitäts-Suite
aus: 2.656 Fixtures, deren erwartete Layouts aus Chrome stammen
(`test/flex-conformance.test.ts`). UIKit und Android Views erhalten nur die Rahmen, die sie
berechnet, sodass ein Baum auf iOS und Android identisch gelayoutet wird.

Das Layout ist inkrementell, wie in Taffy: Ergebnisse bleiben zwischen Durchläufen
bestehen, und eine Änderung layoutet nur den Knoten neu, den sie berührt, und dessen
Vorfahren. Layout-Props, Insets und Baumänderungen markieren ihren Knoten; ebenso die
Props, die die Inhaltsgröße eines Textes, Steuerelements oder einer Liste ändern können
(Text, Schrift, Platzhalter, Zeilen), deklariert in ihren Prop-Tabellen. Eine Paint-Prop
(Farbe, Deckkraft, Ausrichtung) lässt das Layout, wie es ist, und der Text eines
Geschwisters wird nie erneut gemessen, weil anderswo ein Bild angekommen ist. Ein
ausgeblendeter Teilbaum wird wie in Taffy mit Nullen gelayoutet, aber seine Texte behalten
ihre Messungen, sodass das erneute Anzeigen eines Screens die Plattform nichts messen
lässt.

Jeder Knoten hält einen festen Satz gecachter Ergebnisse, Taffys Slots, sodass ein
Viewport, der sich bei jedem Durchlauf ändert (eine Größenänderung, die Tastatur), Einträge
ersetzt, statt neue hinzuzufügen.

Jeder Container ist ein Flex-Container, und die Größenbestimmung folgt exakt CSS:

| Eigenschaft                                                    | Werte                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `flex-direction`, `flex-wrap`, `flex-flow`                     | `row`, `column`, `row-reverse`, `column-reverse`; `nowrap`, `wrap`, `wrap-reverse`, `balance`                                       |
| `flex`, `flex-grow`, `flex-shrink`, `flex-basis`               | wie in CSS (`flex: 1` ist `1 1 0%`, `flex: none`, `flex: 2 0 120px`); JSX `flex={n}` ist das von React Native                       |
| `justify-content`, `align-content`                             | `flex-start`, `flex-end`, `start`, `end`, `center`, `stretch`, `space-between`, `space-around`, `space-evenly`, mit `safe`/`unsafe` |
| `align-items`, `align-self`                                    | `flex-start`, `flex-end`, `start`, `end`, `self-start`, `self-end`, `center`, `baseline`, `stretch`, mit `safe`/`unsafe`            |
| `gap`, `row-gap`, `column-gap`                                 | Länge oder Prozentwert; `gap: <row> <column>`                                                                                       |
| `width`, `height`, `min-*`, `max-*`                            | Länge, Prozentwert, `auto`, `min-content`, `max-content`, `fit-content`, `fit-content(<length>)`, `stretch`                         |
| `aspect-ratio`                                                 | `16 / 9` oder eine Zahl                                                                                                             |
| `margin` (1–4 Werte), `margin-*`, `margin-horizontal/vertical` | Länge, Prozentwert oder `auto` (auto-Margins nehmen den freien Raum auf, wie in CSS)                                                |
| `position`, `top`, `right`, `bottom`, `left`, `inset`          | `relative` (Insets verschieben die Box) oder `absolute`; Länge, Prozentwert oder `auto`                                             |
| `padding`, `border-width`                                      | rücken die Content-Box ein; Prozentwerte werden gegen die Breite des umgebenden Blocks aufgelöst                                    |
| `box-sizing`                                                   | `border-box` (Standard) oder `content-box`                                                                                          |
| `overflow`                                                     | `visible`, `hidden`, `clip`, `scroll`; hidden und scroll beschneiden ebenfalls                                                      |
| `direction`                                                    | `ltr` oder `rtl`: Zeilen laufen von rechts nach links, und start/end tauschen die Seiten                                            |
| `flex-line-count`                                              | die Mindestanzahl an Zeilen, die ein umbrechender Container verwendet (CSS Flexbox 2)                                               |

Dinge, die aus CSS folgen und Umsteiger von React Native überraschen:

- `flex-shrink` ist standardmäßig 1, sodass ein Element mit expliziter Größe trotzdem
  schrumpft, wenn seine Zeile überläuft. `flex-shrink: 0` behält sie bei.
- Die automatische Mindestgröße eines Flex-Elements ist sein Inhalt: Text schrumpft nicht
  unter sein längstes Wort, ein Container nicht unter seine Kinder. `overflow: hidden`
  (oder `min-width: 0`) lässt es weiter schrumpfen.
- `align-items: stretch` streckt nur Kinder ohne explizite Quergröße.
- Prozentwerte werden gegen den umgebenden Block aufgelöst; Padding und Margins gegen
  dessen Breite, auf jeder Seite.

Kuito unterscheidet sich an einer Stelle vom Web: Wie in React Native ist jede View der
umgebende Block ihrer `position: absolute`-Kinder, sodass Insets relativ zur Padding-Box
des Elternelements sind, unabhängig von dessen eigener `position`.

Jede View-Art startet mit Standardwerten:

| View                          | Richtung | Standardwerte                                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `VStack`, `Box`, `Pressable`  | column   |                                                                                             |
| `HStack`                      | row      | `align-items: center`                                                                       |
| `Scroll`                      | column   | `flex-grow: 1` und ein Scroll-Container: füllt den Raum, den sein Elternelement übrig lässt |
| `Scroll horizontal`           | row      | dasselbe, seitwärts scrollend                                                               |
| `Spacer`                      | —        | `flex-grow: 1`: nimmt den freien Raum entlang seines Elternelements ein                     |
| `Divider`                     | —        | mindestens 1pt hoch                                                                         |
| `Button`, `Toggle`, `Spinner` | —        | `flex-shrink: 0`: Steuerelemente laufen über, statt gestaucht zu werden                     |

Eine Scroll-View layoutet ihre Kinder entlang ihrer Achse ohne Begrenzung und scrollt den
Überlauf. `display: none` (`hidden`) entfernt eine View aus dem Layout. Rahmen werden auf
Gerätepixel gerundet, sodass Nachbarn nie Lücken bilden oder sich überlappen.

Die Root-Views stapeln sich in einer Spalte, die den ganzen Bildschirm füllt, randlos auf
beiden Plattformen wie in React Native: Inhalt kann unter der Statusleiste, der Notch und
dem Home-Indikator zeichnen. Inhalt wird in eine `SafeArea` gewickelt, um ihn davon
freizuhalten. Ein Root-Scroll nimmt die volle Höhe ein.

Nicht unterstützt: Block- und Grid-Layout, Floats, vertikale Schreibrichtungen und die
statische Positionierung von CSS (eine absolute Box gehört immer zu ihrem Elternelement).

## Transitions

`transition` listet Eigenschaften mit einer Dauer, einer Timing-Funktion und einer
Verzögerung, wie in CSS:

```css
transition:
  transform 400ms spring(14, 180),
  opacity 250ms ease-out 50ms;
```

- Animierbare Eigenschaften: `opacity`, `background-color`, `transform` (alle
  Transform-Props) und `all`.
- Timing-Funktionen: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`,
  `cubic-bezier(x1, y1, x2, y2)` und `spring(damping, stiffness[, mass])` (eine Feder
  ignoriert die Dauer; ihre zweite Zeitangabe ist die Verzögerung).
- Animationen laufen auf dem UI-Thread, im Motion-Value-Runner
  ([Motion](motion.md#animated-props-animate-and-transition)); JavaScript sendet nur die
  Zielwerte.

## Plattformhinweise

Beide Renderer wenden jede der obigen Eigenschaften an; wo eine Plattform CSS nicht exakt
nachbilden kann, degradiert sie wie folgt.

- **Beschneidung.** Wie in CSS zeichnen Kinder außerhalb ihres Elternelements, sofern
  nicht `overflow: hidden` gesetzt ist (Androids Standard-Clipping ist abgeschaltet). Auf
  iOS beschneidet eine abgerundete View ihren Inhalt, sofern sie keinen Schatten hat;
  `overflow: hidden` beschneidet immer, was auch den Schatten verbirgt.
- **Radien.** `border-radius` wird auf die halbe Größe der View begrenzt, sodass `999px`
  auf beiden Plattformen eine Pille ergibt.
- **Schatten.** iOS verwendet Versatz, Unschärfe und Farbe vollständig. Android zeichnet
  Elevation-Schatten: Die Unschärfe wird auf die Elevation abgebildet, die Farbe gilt ab
  Android 9, und der Versatz wird ignoriert (die Lichtquelle ist fest).
- **Verläufe.** iOS verwendet jeden Winkel; Android rastet auf die nächsten 45° ein.
- **Layout.** Identisch auf beiden Plattformen (eine Engine). Native Steuerelemente
  behalten ihre Plattformgröße: Androids Material-Buttons sind breiter als die von UIKit
  und können eine Zeile überlaufen lassen, die auf iOS passt. Die min-content-Breite von
  Text ist sein breitestes Wort, gemessen mit der Schrift der Plattform.
- **Typografie.** Numerische Schriftstärken und `line-height` brauchen Android 9+; frühere
  Versionen fallen auf regular/bold und die Standard-Zeilenhöhe zurück. Gebündelte und
  geladene Schriftfamilien wählen ihre Dateien auf jeder Version nach Strichstärke
  ([Schriften](fonts.md#how-fontfamily-resolves)); eine unbekannte `font-family` ist ein
  Fehler, der sie benennt.

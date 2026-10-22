# Styles

Kuito kompiliert Styles zur Build-Zeit in native Eigenschaften. `.css`-Module und `styles({...})` teilen sich eine Eigenschaftstabelle: CSS verwendet kebab-case-Namen, `styles()` camelCase, und beide akzeptieren dieselben Werte, einschließlich Kurzschreibweisen als Strings. Nichts parst CSS auf dem Gerät.

## Stylesheets

```css
.card {
  padding: 20px 24px;
  border: 1px solid #ffffff22;
  border-radius: 20px;
  box-shadow: 0 12px 32px #00000066;
  background: linear-gradient(135deg, #1e3a5f, #0b1220);
}
```

```tsx
const sheet = styles({
  card: { padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 },
});
```

`styles()` initialisiert eine `const`, wo immer eine deklariert werden kann: auf Modulebene, in einem Komponentenrumpf, in einem Block. Längen akzeptieren `px`/`dp`, `rem` und `em` ([CSS-Einheiten](./css-units.md)). Unbekannte Eigenschaften und nicht unterstützte Werte lassen den Build mit Datei, Zeile und Grund fehlschlagen.

## Die `class`-Prop

Ein Element erhält seine Klassen über `class`: Namen aus einem `.css`-Import oder `styles()`, als String aus durch Leerzeichen getrennten Namen oder als Liste, deren falsy Einträge übersprungen werden. Wenn sich ein Signal ändert, das sie liest, wird der Zweig der View mit den neuen Klassen neu geplant. Deklarationen gelten in Quellreihenfolge, und die spätere Klasse in `class` gewinnt.

```tsx
import css from './card.css';

<VStack class={[css.card, selected.value && css.selected]} />;
```

## Varianten

Die Varianten einer Klasse sind Regeln für ihre Datenattribute, `.card[data-size=large]` in einem Stylesheet und `variants` in einem `styles()`-Eintrag. Eine Klassenliste wählt sie mit einem Objekt aus Datenattributen aus; ein falsy Wert wählt keine. Eine Variante gewinnt über ihre Klasse.

```css
.card {
  padding: 12px;
}
.card[data-size='large'] {
  padding: 24px;
}
```

```tsx
const button = styles({
  base: { padding: '8px 16px', variants: { tone: { primary: { backgroundColor: '#ff5a5f' } } } },
});

<Pressable class={[button.base, { tone: tone.value }]} />;
```

## Die `style`-Prop

Ein Primitiv nimmt auch eigene Styles an, `style={{ ... }}`, mit denselben camelCase-Eigenschaften und Werten wie `styles()`. Eine Deklaration, deren Wert sich ändert, muss eine native Prop benennen (`opacity`, `paddingTop`, `backgroundColor`); eine Kurzschreibweise mit einem Ausdruck ist ein Build-Fehler. `style` gewinnt über `class` für die Props, die beide setzen: Styles mit `class` teilen, `style` für das behalten, was eine View allein braucht.

```tsx
<Box style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }} />
```

## Tokens

In `:root` deklarierte Custom Properties sind Tokens: `var(--name)` wird zur Build-Zeit durch seinen Wert ersetzt. Ein Stylesheet sieht seine eigenen Tokens und die der Stylesheets, die es per `@import` einbindet. Ein `:root`-Block innerhalb von `@media (prefers-color-scheme: dark)` definiert Tokens für dieses Schema neu; ein Theme-Wechsel sendet nur die Props erneut, die ihm folgen.

```css
@import './tokens.css';

.card {
  padding: var(--space);
  border: 1px solid var(--accent);
}
```

## Bedingungen und Plattformen

`@media`-Blöcke enthalten Regeln, deren Deklarationen gelten, solange ihre Query zutrifft. Eine Query besteht aus Features in Klammern, verbunden mit `and`. Die Deklarationen einer Bedingung gewinnen über die eigenen ihrer Klasse, solange sie zutrifft; eine spätere Klasse in `class` gewinnt über beide.

| Feature                  | Werte                           |
| ------------------------ | ------------------------------- |
| `min-width`, `max-width` | eine Länge in `px`              |
| `width-class`            | `compact`, `medium`, `expanded` |
| `prefers-color-scheme`   | `light`, `dark`                 |
| `prefers-reduced-motion` | `reduce`, `no-preference`       |

Ein `@platform`-Block benennt `ios` oder `android`; das Bundle der anderen Plattform sieht ihn nie. `platform` aus `kuito` ist eine Konstante, die der Compiler pro Bundle festlegt. Es gibt kein `Platform.select` zur Laufzeit.

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

## Vertiefung

[Native Styles](../../../../docs/styles.md) behandelt Werte und Farben, die Eigenschaftstabelle, Flexbox-Layout, Transitions und Plattformhinweise.

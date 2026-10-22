# Barrierefreiheit

Ein einziger Satz von Barrierefreiheits-Props funktioniert auf jeder View, auf
beiden Plattformen, mit VoiceOver auf iOS und TalkBack auf Android: `label`,
`hint`, `role` (die Namen von ARIA), `live`, `actions` und die
`aria-*`-Fakten von ARIA.

```tsx
<Pressable
  role="button"
  label="Play"
  hint="Starts the episode"
  aria-disabled={!ready.value}
  onPress={play}
>
  <Image src={icon} />
</Pressable>
```

## Props

| Prop                                                                           | Bedeutung                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `accessible`                                                                   | Macht die View zu einem einzigen Element, vorgelesen als ihr `label` oder, ohne eines, als Text ihrer Kinder.        |
| `label`                                                                        | Was der Screenreader vorliest.                                                                                       |
| `hint`                                                                         | Was bei der Aktivierung geschieht, nach einer Pause vorgelesen.                                                      |
| `role`                                                                         | Was die View ist, in den Namen von ARIA: `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab`, ... (unten). |
| `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy`, `aria-expanded` | Der Zustand der View; `aria-checked` kann `'mixed'` sein.                                                            |
| `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`            | Ein Bereich oder ein textueller Wert.                                                                                |
| `aria-hidden`                                                                  | Screenreader überspringen die View und ihren Teilbaum.                                                               |
| `live`                                                                         | `off`, `polite` oder `assertive`: Änderungen am Text der View werden angesagt; siehe [Live-Regionen](#live-regions). |
| `actions`                                                                      | `[{ name, label? }]`: Standardaktionen oder eigene, aufgeführt unter `label`.                                        |
| `onAction`                                                                     | Wird mit `{ actionName }` aufgerufen, wenn eine ausgeführt wird.                                                     |

Ein **Pressable ist ein einziges Element**, vorgelesen als Text seiner
Kinder, daher braucht es etwas zum Vorlesen: ein `label` oder Text unter
seinen Kindern. Ein Pressable ohne beides (ein Icon allein) ist ein
Build-Fehler, der seine Zeile benennt.

### Rollen

| Rolle                                                                            | VoiceOver                           | TalkBack                                    |
| -------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------- |
| `button`, `menuitem`, `radio`, `tab`, `combobox`                                 | Button                              | Button, RadioButton oder der Name der Rolle |
| `checkbox`, `switch`                                                             | Button, mit dem Checked-Zustand     | CheckBox, Switch                            |
| `heading`                                                                        | Überschrift (Rotor)                 | Überschrift                                 |
| `img`                                                                            | Bild                                | ImageView                                   |
| `link`                                                                           | Link                                | "link"                                      |
| `slider`, `spinbutton`                                                           | Anpassbar (nach oben/unten wischen) | SeekBar, "spin button" (Scroll-Aktionen)    |
| `searchbox`                                                                      | Suchfeld                            | EditText                                    |
| `tablist`                                                                        | Tableiste: Tabs lesen "n von m"     | "tab list"                                  |
| `progressbar`, `timer`                                                           | Wird häufig aktualisiert            | ProgressBar, "timer"                        |
| `summary`                                                                        | Zusammenfassung                     | "summary"                                   |
| `alert`, `grid`, `list`, `menu`, `menubar`, `radiogroup`, `scrollbar`, `toolbar` | Kein Trait                          | Der Name der Rolle                          |
| `none`, `presentation`                                                           | Nichts                              | Nichts                                      |

Eine Rolle außerhalb dieser ist ein Fehler, der die unterstützten benennt.
Ein Zustand wird zu dem, was jeder Reader dafür hat: `aria-disabled` blendet
das Element ab, `aria-selected` wählt es aus, `aria-checked` ist ein
abhakbarer Zustand auf Android und "checked" / "not checked" (oder "on" /
"off" bei einem Switch) auf iOS, `aria-expanded` ist eine Aktion zum Aus-
oder Einklappen auf Android und "expanded" / "collapsed" auf iOS, und
`aria-busy` wird als "busy" vorgelesen. Ein Bereich ist auf Android ein
Bereich und auf iOS sein aktueller Wert; `aria-valuetext` hat auf beiden
Vorrang vor `aria-valuenow`. Jeder Fakt ist eine eigene native Prop, sodass
die Änderung eines Fakts nur diesen aktualisiert.

### Aktionen

`activate`, `increment`, `decrement` und `longpress` ersetzen die eigenen
Gesten des Readers: Doppeltippen, auf einem anpassbaren Element nach oben
und unten wischen auf iOS, und TalkBacks Klick, Vorwärts- und
Rückwärtsscrollen und langen Klick. `magicTap` und `escape` sind
VoiceOver-Gesten ohne TalkBack-Entsprechung und tun auf Android nichts.
Jeder andere Name ist eine eigene Aktion, im Aktionen-Rotor von VoiceOver und
im Aktionsmenü von TalkBack, unter ihrem `label`.

Auf iOS 16 sind die Standardaktionen ebenfalls eigene Aktionen: UIKits
Handler dafür brauchen iOS 17. Aus demselben Grund wird ein
`accessible`-Container ohne Label nur ab iOS 17 aus seinen Kindern
vorgelesen; für iOS 16 ein `label` angeben. Ein Pressable liest seine Kinder
auf jeder Version.

```tsx
<HStack
  accessible
  role="slider"
  label="Rating"
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={stars.value}
  aria-valuetext={stars.value + ' of 5 stars'}
  actions={[{ name: 'increment' }, { name: 'decrement' }]}
  onAction={(event) => change(event.actionName === 'increment' ? 1 : -1)}
>
  ...
</HStack>
```

## Das accessibility-Modul

```tsx
import { watch, accessibility } from 'kuito';

accessibility.announce('12 shows found');
accessibility.announce('Saved', { queue: true });
accessibility.focus(title.current);

accessibility.screenReader.value; // true, false, or null until the platform answers
watch(accessibility.reduceMotion, (calm) => (animations.value = !calm)); // in a component
```

- Eine Ansage unterbricht die laufende Sprachausgabe; `queue: true` wartet
  darauf (iOS; TalkBack reiht immer ein).
- `focus` nimmt ein Element, etwa `ref.current`.
- Der Screenreader-Status ist VoiceOver auf iOS und die Touch-Erkundung
  (TalkBack) auf Android. Bewegung reduzieren ist die iOS-Einstellung und
  Androids Animationen entfernen (eine Animator-Dauerskala von 0).
- `screenReader` und `reduceMotion` sind Signale. Das erste Lesen fragt die
  native Seite einmal und ist `null`, bis sie antwortet; die Antwort und jede
  spätere Änderung aktualisieren beide, und ein Wert, der gleich bleibt, ist
  keine Änderung.

## Live-Regionen

`live` sagt Änderungen am Text einer View an: `polite` wartet auf die laufende Sprachausgabe, `assertive` unterbricht sie. Android
hat Live-Regionen nativ. UIKit hat keine, daher beobachtet Kuito auf iOS
Text innerhalb der Region und sagt, sobald ein Stapel von Änderungen
angewendet wurde, an, was die Region nun liest.

```tsx
<Text live="polite">{status.value}</Text>
```

## Wie es die Grenze überquert

Ansagen, Fokus und die Statusanfrage sind Befehle in der Mutationswarteschlange,
wie `focus()` (siehe [Tastatur](keyboard.md#how-it-crosses-the-boundary)).
Der Status trifft als natives App-Event `accessibility.status` mit
`{ screenReaderEnabled, reduceMotionEnabled }` ein;
Barrierefreiheitsaktionen treffen als `<id>.accessibilityaction` mit
`{ actionName }` ein.

Auf iOS berechnet UIKit die Barrierefreiheitsstandardwerte eines Labels oder
Buttons nur, solange eine assistive Technologie läuft, daher schreibt der
Renderer eine Eigenschaft nur, wenn eine Prop sie setzt, und stellt wieder
her, was vorher da war, wenn die Prop entfällt.

# Barrierefreiheit

Ein Satz von Barrierefreiheits-Props funktioniert auf jeder View, auf beiden Plattformen, mit VoiceOver auf iOS und TalkBack auf Android: `label`, `hint`, `role` (die Namen von ARIA), `live`, `actions` und die `aria-*`-Fakten von ARIA.

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

- `accessible` macht die View zu einem einzigen Element, vorgelesen als ihr `label` oder, ohne eines, als Text ihrer Kinder.
- `label` ist, was der Screenreader vorliest; `hint` ist, was bei der Aktivierung geschieht, nach einer Pause vorgelesen.
- `role` ist, was die View ist, in den Namen von ARIA: `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab` und mehr. Eine Rolle außerhalb der unterstützten ist ein Fehler, der sie nennt.
- `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy` und `aria-expanded` sind der Zustand der View; `aria-valuemin`, `aria-valuemax`, `aria-valuenow` und `aria-valuetext` ein Bereich oder ein textueller Wert.
- `aria-hidden`: Screenreader überspringen die View und ihren Teilbaum.
- `actions` listet Standardaktionen oder eigene nach `label`; `onAction` wird mit `{ actionName }` aufgerufen, wenn eine ausgeführt wird.

Ein Pressable ist ein einziges Element, vorgelesen als Text seiner Kinder, also braucht es etwas zum Vorlesen: ein `label` oder Text unter seinen Kindern. Ein Pressable ohne beides (ein Icon allein) ist ein Build-Fehler, der seine Zeile nennt. Jeder Fakt ist eine eigene native Prop, also aktualisiert eine Änderung nur diese eine.

## Aktionen

`activate`, `increment`, `decrement` und `longpress` ersetzen die eigenen Gesten des Readers: Doppeltipp, Wischen nach oben und unten auf einem anpassbaren Element auf iOS, sowie TalkBacks Klick, Vorwärts- und Rückwärtsscrollen und langen Klick. `magicTap` und `escape` sind VoiceOver-Gesten ohne TalkBack-Entsprechung. Jeder andere Name ist eine eigene Aktion, im Aktionen-Rotor von VoiceOver und im Aktionsmenü von TalkBack, unter ihrem `label`.

```tsx
<HStack
  accessible
  role="slider"
  label="Rating"
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={stars.value}
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

- Eine Ansage unterbricht die aktuelle Sprachausgabe; `queue: true` wartet darauf (iOS; TalkBack reiht immer ein).
- `focus` nimmt ein Element, etwa `ref.current`.
- `screenReader` und `reduceMotion` sind Signale. Das erste Lesen fragt die native Seite einmal und ist `null`, bis sie antwortet; die Antwort und jede spätere Änderung aktualisieren beide.

## Live-Regionen

`live` sagt Änderungen am Text einer View an: `polite` wartet auf die aktuelle Sprachausgabe, `assertive` unterbricht sie. Android hat Live-Regionen nativ; auf iOS beobachtet Kuito Text in der Region und sagt, sobald ein Batch von Änderungen angewendet ist, an, was die Region jetzt liest.

```tsx
<Text live="polite">{status.value}</Text>
```

## Vertiefung

[Barrierefreiheit](../../../../docs/accessibility.md) behandelt, wie jede Rolle und jeder Zustand in VoiceOver und TalkBack vorgelesen wird, was iOS 16 braucht, und wie Ansagen und Aktionen die native Grenze überqueren.

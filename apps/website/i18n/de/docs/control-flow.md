# Kontrollfluss

Struktur, die vom Zustand abhängt — ein Panel anzeigen, einen Tab auswählen — verwendet
`Show`, `Switch`, `Match` und `For` aus `kuito`, nach dem Vorbild von Solids Komponenten.
Ein reaktiver Kind-Ausdruck (`{open.value ? <Panel /> : null}`) funktioniert ebenfalls.

```tsx
import { Show, Switch, Match } from 'kuito';

<Show when={user.value} fallback={<SignIn />}>
  {(user) => <Text>Hi {user.name}</Text>}
</Show>

<Switch fallback={<NotFound />}>
  <Match when={tab.value === 'home'}><Home /></Match>
  <Match when={tab.value === 'search'}><Search /></Match>
</Switch>
```

- `Show` rendert seine Kinder, solange `when` truthy ist, andernfalls `fallback`. Ein
  einzelnes Callback-Kind erhält den truthy Wert.
- `Switch` rendert das erste `Match`, dessen `when` truthy ist, andernfalls
  `fallback`. `Match` muss ein direktes Kind von `Switch` sein; seine Kinder dürfen ebenfalls
  ein Callback sein.
- `Switch` ist Kontrollfluss. Das native Ein/Aus-Steuerelement ist `Toggle`
  (React Natives `Switch`), sodass eine Datei beide verwenden kann.

## For

`For` rendert eine Zeile pro Element von `each` (ein Array, ein Signal eines Arrays oder ein
[Store](reactivity.md#stores)-Array), für Listen, die nicht virtualisiert sind, etwa
ein paar Dutzend Zeilen in einem `Scroll`. Eine lange Liste gehört in `List`
([lists.md](lists.md)).

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

<Scroll>
  <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
    {(task, index) => <Text>{index.value + 1 + '. ' + task.title + (task.done ? ' ✓' : '')}</Text>}
  </For>
</Scroll>;
```

- Zeilen werden nach Element geschlüsselt: ein Objekt nach seiner Identität (die Objekte
  eines Stores behalten ihre, wohin sie auch wandern), ein String oder eine Zahl nach ihrem
  Wert, nummeriert, wo er sich wiederholt. Eine Umsortierung verschiebt die Views der Zeilen;
  keine View wird neu erzeugt.
- Eine Zeile rendert einmal pro Element. Wenn sich `each` ändert, gibt eine Zeile, deren
  Element geblieben ist, den Baum zurück, den sie gerendert hat, sodass ihre Bindungen nicht
  erneut ausgewertet werden; `index` ist ein Signal, das der Position der Zeile folgt.
- `fallback` rendert, solange `each` leer ist.
- Sein einziges Kind ist die Funktion, die eine Zeile rendert.

## Wie es aktualisiert

`when`-Bedingungen und reaktive Kind-Ausdrücke werden mit Abhängigkeitsverfolgung
ausgewertet, während der View-Plan erstellt wird. Jedes `Show`, `Switch`, `For` und jeder
reaktive Kind-Ausdruck besitzt seinen Zweig: Wenn sich ein Signal ändert, das seine Bedingung
gelesen hat, wird nur dieser Zweig neu geplant, in einem Microtask (mehrere Änderungen in
einem Tick teilen sich eine Neuplanung), ausgehend von den Elementen, die das Modul zuletzt
gerendert hat. Der Rest des Bildschirms wird nicht durchlaufen, seine Bindungen werden nicht
ausgewertet, und seine Subscriptions bleiben bestehen. Ein Zweig innerhalb eines anderen
gehört zum innersten Besitzer; ändern sich beide in einem Tick, plant der äußere neu und
nimmt den inneren mit. Der Komponentenzustand bleibt erhalten, beibehaltene Views werden
wiederverwendet, und nur das, was der Zweig geändert hat, wird unmountet und gemountet.
Unmountete Views spielen ihren `exit`-Effekt ab; gemountete Views spielen `enter` ab
([Motion](motion.md)).

Ein Signal, das von einer strukturellen Entscheidung außerhalb jedes Besitzers gelesen wird
(das `horizontal` eines `Scroll`, eine Gestenoption an der Wurzel des Moduls), plant das
gesamte Modul neu, über denselben Pfad wie Live Patch. Dasselbe gilt für einen Zweig, der
nicht allein neu planen kann: einen, dessen Plan eine Exception wirft, oder, auf einem Host,
der Views nicht verschieben kann, einen, der die Geschwister nach ihm neu erzeugen würde.

Eine Komponenteninstanz ist ihr Platz im Baum, ihre Komponente und ihr `key`, wie in
React. Ein Zweig, der unmountet wird, verwirft den Zustand seiner Instanzen und räumt deren
Lebenszyklus auf; wird er wieder angezeigt, werden neue Instanzen gemountet, die mit ihrem
Anfangszustand beginnen und `onMount` erneut ausführen. Das Rendern einer anderen Komponente,
oder derselben mit einem anderen `key`, an derselben Stelle mountet ebenfalls eine neue
Instanz.

Eigenschaftsbindungen (`opacity={count.value > 0 ? 1 : 0.5}`) bleiben feingranular und planen
nie neu. Eine fehlgeschlagene Neuplanung committet nichts — die vorherige UI bleibt bestehen —
und wird einmal über die Fehlerschnittstelle der Laufzeit gemeldet.

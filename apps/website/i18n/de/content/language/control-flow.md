# Kontrollfluss

Struktur, die vom Zustand abhängt, ein Panel anzeigen oder einen Tab auswählen, verwendet `Show`, `Switch`, `Match` und `For` aus `kuito`. Ein reaktiver Kind-Ausdruck (`{open.value ? <Panel /> : null}`) funktioniert ebenfalls.

## Show

`Show` rendert seine Kinder, solange `when` truthy ist, andernfalls `fallback`. Ein einzelnes Callback-Kind erhält den truthy Wert.

```tsx
import { Show } from 'kuito';

<Show when={user.value} fallback={<SignIn />}>
  {(user) => <Text>Hi {user.name}</Text>}
</Show>;
```

## Switch und Match

`Switch` rendert das erste `Match`, dessen `when` truthy ist, andernfalls `fallback`. `Match` muss ein direktes Kind von `Switch` sein; seine Kinder dürfen ebenfalls ein Callback sein. `Switch` ist Kontrollfluss: Das native Ein/Aus-Steuerelement ist `Toggle`, sodass eine Datei beide verwenden kann.

```tsx
import { Switch, Match } from 'kuito';

<Switch fallback={<NotFound />}>
  <Match when={tab.value === 'home'}>
    <Home />
  </Match>
  <Match when={tab.value === 'search'}>
    <Search />
  </Match>
</Switch>;
```

## For

`For` rendert eine Zeile pro Element von `each` (ein Array, ein Signal eines Arrays oder ein [Store](../../../../docs/reactivity.md#stores)-Array), für Listen, die nicht virtualisiert sind, etwa ein paar Dutzend Zeilen in einem `Scroll`. Eine lange Liste gehört in [`List`](../../../../docs/lists.md). Sein einziges Kind ist die Funktion, die eine Zeile rendert; `fallback` rendert, solange `each` leer ist.

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

<Scroll>
  <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
    {(task, index) => <Text>{index.value + 1 + '. ' + task.title}</Text>}
  </For>
</Scroll>;
```

- Zeilen werden nach Element geschlüsselt: ein Objekt nach seiner Identität, ein String oder eine Zahl nach seinem Wert. Eine Umsortierung verschiebt die Views der Zeilen; keine View wird neu erzeugt.
- Eine Zeile rendert einmal pro Element. Wenn sich `each` ändert, gibt eine Zeile, deren Element geblieben ist, den Baum zurück, den sie gerendert hat; `index` ist ein Signal, das der Position der Zeile folgt.

## Wie es aktualisiert

Jedes `Show`, `Switch`, `For` und jeder reaktive Kind-Ausdruck besitzt seinen Zweig: Wenn sich ein Signal ändert, das seine Bedingung gelesen hat, wird nur dieser Zweig neu geplant, in einem Microtask. Der Rest des Screens wird nicht durchlaufen, seine Bindings werden nicht ausgewertet, und seine Abonnements bleiben. Komponentenzustand bleibt erhalten, behaltene Views werden wiederverwendet, und nur das, was der Zweig geändert hat, wird unmountet und gemountet.

Ein Zweig, der unmountet, verwirft den Zustand seiner Instanzen; ihn erneut anzuzeigen mountet neue Instanzen, die von ihrem Anfangszustand starten und `onMount` erneut ausführen. Property-Bindings (`opacity={count.value > 0 ? 1 : 0.5}`) bleiben feingranular und planen nie neu. Eine fehlgeschlagene Neuplanung committet nichts: Die vorherige UI bleibt.

## Vertiefung

[Kontrollfluss](../../../../docs/control-flow.md) behandelt verschachtelten Zweigbesitz, was das ganze Modul neu plant, und Komponentenidentität.

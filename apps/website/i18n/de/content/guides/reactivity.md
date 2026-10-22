# Reaktivität

Signale halten die Werte, die sich ändern. JSX, das ein Signal liest, folgt ihm, ohne die Komponente erneut auszuführen.

## Signale

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

function Counter() {
  const count = signal(0);
  const doubled = computed(() => count.value * 2);
  watch(count, (next, previous) => console.log(previous, '->', next));
  return (
    <Pressable onPress={() => count.value++}>
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)`, erstellt, während eine Komponente aufsetzt, gehört zum Slot dieser Komponente; anderswo erstellt ist es ein eigenständiges Signal.
- `computed(fn)` ist ein schreibgeschütztes Signal dessen, was `fn` zurückgibt, beim ersten Lesen berechnet und erneut nur, wenn sich ein gelesenes Signal geändert hat.
- `watch(source, fn)` führt `fn(next, previous)` aus, wenn sich das Signal oder das, was die Funktion `source` liest, ändert. In einer Komponente endet es beim Unmount der Komponente; anderswo läuft es ab jetzt. Es gibt eine Subscription zurück, deren `remove()` es stoppt.
- `effect(fn)` führt `fn` erneut aus, wann immer sich ändert, was es gelesen hat.

## Batching

Schreibvorgänge batchen sich selbst. Alles, was ein natives Ereignis schreibt, erreicht den Bildschirm zusammen, in einem Host-Batch. Ein Schreibvorgang anderswo (nach einem `await`, in einem Timer) öffnet einen Batch, der mit dem nächsten Microtask endet. Ein Lesen ist immer aktuell: ein `computed`, direkt nach einem Schreibvorgang gelesen, sieht ihn.

## Signale in Props

Eine Prop nimmt einen Wert oder ein Signal (`Prop<T>`): `opacity={level}` folgt `level`, wie `opacity={level.value}` es tut, da der Compiler jeden JSX-Ausdruck reaktiv macht. Eine Funktion in einer Prop ist immer ein Handler, also ist ein handgeschriebener Thunk (`opacity={() => level.value}`) ein Typfehler: den Ausdruck schreiben oder ein Signal mit `computed(() => ...)` ableiten. Kinder und das `when` von `Show` nehmen Signale genauso.

Ein `.value`-Lesen im Rumpf einer Komponente, außerhalb von JSX und außerhalb jeder Funktion, sieht nur den ersten Wert, weil die Komponente einmal aufsetzt. Der Compiler warnt davor mit Datei und Zeile.

## Stores

`store(initial)` erstellt ein Objekt oder ein Array, dessen jeder Pfad ein Signal ist:

```tsx
import { Pressable, Text, store } from 'kuito';

const shelf = store({ books: [{ id: 1, title: 'Dune', liked: false }] });

function Book() {
  return (
    <Pressable onPress={() => (shelf.books[0].liked = true)}>
      <Text>{shelf.books[0].liked ? '♥' : '♡'}</Text>
    </Pressable>
  );
}
```

- Ein Lesen durch den Store verfolgt nur diesen Pfad: das Label oben folgt `books[0].liked`, und ein Schreiben auf `books[0].title` lässt es unberührt.
- Array-Methoden (`push`, `splice`, `sort`) schreiben ebenfalls durch ihn.
- Er umhüllt `initial`, statt es zu kopieren, sodass die Daten einfach bleiben. Durch den Store schreiben: eine Änderung direkt am einfachen Objekt erreicht niemanden.
- Einfache Objekte und Arrays darin sind ebenfalls Stores; Klasseninstanzen, Dates und Maps sind Werte.

## Komponenten-Props

Eine Komponente liest ihre Props als Werte, wie in React: `props.show.name`. Wo eine Prop gelesen wird, entscheidet, was sich aktualisiert:

- In JSX gelesen (`<Text>{props.count}</Text>`) bleibt sie reaktiv: der Text folgt dem Signal hinter der Prop.
- Im Komponentenrumpf gelesen oder destrukturiert (`function Label({ count })`) wird sie einmal gelesen, wenn die Komponente rendert.

Props dort lesen, wo sie verwendet werden, wenn sie einem Signal folgen sollen.

## Hook-Identität

Der Zustand eines Hooks gehört zu seinem Slot, mit dem Schlüssel `<component path>:<kind>:<name>`, nie seiner Position unter den Aufrufen. Ein einer Variablen zugewiesener Hook ist nach ihr benannt (`const visits = signal(1)`); einer, der nichts zugewiesen wird, nach seiner Ordnungszahl unter den Hooks seiner Art.

Einen Hook hinzuzufügen, Hooks umzuordnen oder einen in einem `if` aufzurufen erhält also den Zustand jedes anderen Hooks über Live Patches hinweg. Eine Variable umzubenennen benennt ihren Slot um, der von vorn beginnt. Der Zustand eines Slots hält so lange wie seine Komponenteninstanz.

## Vertiefung

[Reaktivität](../../../../docs/reactivity.md) behandelt, wie ein Quell-Patch Ausdruckswerte erhält, die vollständigen Hook-Benennungsregeln und was eine Komponenteninstanz ausmacht.

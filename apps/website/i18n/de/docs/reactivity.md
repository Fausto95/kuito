# Reaktivität

## Signale

Ein Signal hält einen Wert, der sich ändert. JSX, das ihn liest, folgt ihm,
ohne die Komponente erneut auszuführen:

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

const theme = signal<'light' | 'dark'>('light'); // shared by every component

function Counter() {
  const count = signal(0); // this component's own, kept across Live Patches
  const doubled = computed(() => count.value * 2);

  watch(count, (next, previous) => console.log(previous, '→', next));

  return (
    <Pressable
      onPress={() => {
        count.value++;
        theme.value = 'dark'; // one update with the count, no batch() needed
      }}
    >
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)`, das während des Aufbaus einer Komponente erzeugt wird,
  gehört zum Slot dieser Komponente (siehe unten); an jeder anderen Stelle
  erzeugt, ist es ein eigenständiges Signal.
- `computed(fn)` ist ein schreibgeschütztes Signal dessen, was `fn`
  zurückgibt; es wird beim ersten Lesen berechnet und danach nur erneut, wenn
  sich ein von ihm gelesenes Signal geändert hat.
- `watch(source, fn)` führt `fn(next, previous)` aus, wenn sich das Signal
  oder das, was die Funktion `source` liest, ändert. In einer Komponente endet
  es, wenn die Komponente unmountet wird; andernorts läuft es von nun an. In
  beiden Fällen gibt es eine Subscription zurück, deren `remove()` es beendet.
- `effect(fn)` führt `fn` erneut aus, wann immer sich ändert, was es gelesen
  hat.

Schreibvorgänge bündeln sich selbst. Alles, was ein natives Ereignis
schreibt, erreicht den Bildschirm gemeinsam, in einem Host-Batch. Ein
Schreibvorgang an jeder anderen Stelle (nach einem `await`, in einem Timer)
öffnet einen Batch, der mit dem nächsten Microtask endet, sodass die
Schreibvorgänge bis dahin ebenfalls gemeinsam gehen. Ein Lesevorgang ist immer
aktuell: Ein `computed`, das direkt nach einem Schreibvorgang gelesen wird,
sieht ihn. Was später läuft, ist nur das, was zuhört: Bindungen, `watch` und
`effect`.

Eine Prop nimmt einen Wert oder ein Signal (`Prop<T>`): `opacity={level}`
folgt `level`, ebenso wie `opacity={level.value}`, da der Compiler jeden
JSX-Ausdruck reaktiv macht. Eine Funktion in einer Prop ist immer ein Handler,
daher ist ein handgeschriebener Thunk (`opacity={() => level.value}`) ein
Typfehler: den Ausdruck schreiben oder mit `computed(() => …)` ein Signal
ableiten. Kinder und das `when` von `Show` nehmen Signale auf dieselbe Weise
entgegen.

Ein `.value`-Lesevorgang im Rumpf einer Komponente, außerhalb von JSX und
außerhalb jeder Funktion, sieht nur den ersten Wert, da die Komponente nur
einmal aufgebaut wird. Der Compiler warnt davor mit Datei und Zeile, und die
CLI zeigt die Warnung an.

## Stores

`store(initial)` erzeugt ein Objekt oder ein Array, dessen jeder Pfad ein
Signal ist, nach dem Vorbild der mutable Stores von Solid:

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

- Ein Lesevorgang über den Store verfolgt nur diesen Pfad: Das Label oben
  folgt `books[0].liked`, und ein Schreibvorgang auf `books[0].title` lässt es
  unberührt.
- Ein Schreibvorgang über den Store benachrichtigt die Bindungen, die das
  Geänderte gelesen haben, gebündelt wie jeder Signal-Schreibvorgang.
  Array-Methoden (`push`, `splice`, `sort`) schreiben ebenfalls über ihn: Ein
  Ausdruck, der `books.length` gelesen oder das Array gemappt hat, folgt
  ihnen, und `Object.keys` und `in` folgen Schlüsseln, die kommen und gehen.
- Er umhüllt `initial`, statt es zu kopieren, und jedes Objekt hat einen
  Proxy: `shelf.books[0] === shelf.books[0]`. Ein Store-Objekt, das in einen
  anderen Pfad zugewiesen wird, wird als sein einfaches Objekt gespeichert,
  sodass die Daten einfach bleiben (es lässt sich per `JSON.stringify` so
  ausgeben, wie es ist). Über den Store schreiben: Eine direkt am einfachen
  Objekt vorgenommene Änderung erreicht niemanden.
- Einfache Objekte und Arrays darin sind ebenfalls Stores; Klasseninstanzen,
  Datumsobjekte und Maps sind Werte.
- Während des Aufbaus einer Komponente erzeugt, gehört er zum Slot dieser
  Komponente und bleibt über Live Patches hinweg erhalten, wie `signal()`
  (der Compiler benennt ihn).

## Granulare Aktualisierung und Ausdrucksidentität

Kuito unterscheidet **Signal-Updates** von **Quell-Patches**.

- Signal-Updates ändern abhängige native Eigenschaften, ohne Komponenten erneut auszuführen.
- Ein Quell-Patch baut derzeit den Komponenten-Deskriptorbaum neu auf, um
  strukturelle Änderungen zu erkennen. Das ist auf Komponentenebene noch nicht feingranular.
- Während eines Quell-Patches werden vom Compiler markierte JSX-Ausdruckswerte
  beibehalten, wenn der Ausdrucks-Hash, der umgebende statische Text und die
  stabile View-ID übereinstimmen. Der alte native Wert wird wiederverwendet;
  eine neue Closure empfängt nachfolgende Signaländerungen.
- Ausdrücke, deren Quelltext sich ändert, werden erneut ausgewertet. Das
  verhindert gezielt, dass sich <Text>Hey{Math.random()}</Text> nur deshalb
  ändert, weil ein anderes Button-Label bearbeitet wurde.
- Ein Re-Render (ein strukturelles Signal plant das Modul neu) wertet die
  Ausdrücke einer erneut ausgeführten Komponente neu aus: Derselbe Quelltext
  läuft mit anderen Props. Eine Komponente, die nicht erneut ausgeführt wurde,
  gibt ihren vorherigen Baum zurück, und eine Prop oder ein Label, dessen
  Thunk dasselbe Objekt ist, behält seinen Wert und die gelesenen Signale,
  unausgewertet, in jedem Plan. Subscriptions bleiben über Pläne hinweg
  bestehen: Eine beibehaltene Bindung behält sie, und eine erneut ausgewertete
  Bindung abonniert nur die Signale, die sie neu liest, und gibt die frei, die
  sie nicht mehr liest. Eine Objekt-Prop, die zu gleichen Daten neu aufgebaut
  wird (ein Style, die Gesten), wird nicht erneut gesendet: Der Kernel behält
  das JSON, als das die Objekt-Props jeder View zuletzt gesendet wurden.

Dies ist eine **gezielte Abmilderung, keine reine feingranulare
Quell-Invalidierung**: Komponentenfunktionen werden beim Vorbereiten eines
Patches weiterhin ausgeführt, und Code in Komponentenrümpfen kann
Seiteneffekte haben. Änderungen an nicht-reaktiven, per Closure erfassten
Werten, an Eingaben übergeordneter Komponenten, an lexikalischen Closures und
an sich dynamisch ändernden Abhängigkeiten werden möglicherweise nicht
abgebildet, wenn der Ausdruckstext unverändert ist. Zukünftige Arbeit: vom
Compiler erzeugte Komponenten-Abhängigkeitsgraphen, vollständige
Prop-Invalidierung pro Instanz, reaktives Nachverfolgen dynamischer
Abhängigkeiten und sicherer Teilbaum-Neuaufbau. Für die Korrektheit der App
nicht auf unreine Render-Ausdrücke verlassen.

## Hook-Identität

Der Zustand eines Hooks gehört zu seinem Slot, und der Schlüssel eines Slots
ist `<component path>:<kind>:<name>`, niemals seine Position unter den
Aufrufen. Der Compiler übergibt jedem Hook seinen Namen als letztes Argument:

- Ein Hook, der einer Variablen zugewiesen wird, ist nach ihr benannt:
  `const visits = signal(1)` wird zu `signal(1, "visits")`, und `store`,
  `motion`, `ref`, `task` und `resource` ebenso;
- ein Hook, der nichts zugewiesen wird (`onMount`, `onCleanup`, `effect`,
  `watch` oder ein bloßes `signal(0)`), wird nach seiner Ordnungszahl unter
  den Hooks seiner Art in seiner Funktion benannt, in Quelltextreihenfolge:
  `effect(fn, "#2")`;
- ein Name, der in einem Render zweimal beansprucht wird (ein Helfer, der
  `signal()` zweimal für dieselbe Variable aufruft), erhält `name#2`,
  `name#3`, in Aufrufreihenfolge. Code, den der Compiler nicht gesehen hat,
  wird auf dieselbe Weise nach Aufrufreihenfolge benannt.

`task` und `resource` teilen sich eine Art, daher müssen sich ihre Namen
voneinander unterscheiden; jede andere Art hat ihre eigenen Namen.

Das Hinzufügen eines Hooks, das Umordnen von Hooks oder der Aufruf eines Hooks
innerhalb eines `if` erhält also den Zustand jedes anderen Hooks: Live Patch
behält die Slots, deren Schlüssel überleben, startet neue von ihren
Anfangswerten und entsorgt entfernte (ein entferntes `effect` oder `onMount`
führt sein Cleanup aus, ein entfernter `motion`-Wert wird auf beiden Threads
freigegeben), und eine Warnung auf dem Gerät nennt die Hooks, die kamen und
gingen. Ein Hook innerhalb eines `if` hält seinen Slot nur, solange der Zweig
läuft: Wird die Bedingung falsch, wird sein Zustand freigegeben, und er
beginnt von vorn, wenn die Bedingung wieder wahr wird. Das Umbenennen einer
Variablen benennt ihren Slot um, der damit von vorn beginnt.

Der Zustand eines Slots lebt so lange wie seine Komponenteninstanz: Eine
Instanz, die den Baum verlässt, gibt jeden Slot frei, den sie hielt, und eine
Instanz, die zurückkehrt, beginnt mit den Anfangswerten. Eine Instanz ist ihr
Platz, ihre Komponente und ihr `key` (`incremental.md`): Das Rendern einer
anderen Komponente oder eines anderen Keys am selben Platz ist eine neue
Instanz, selbst innerhalb eines Ausdrucks wie `{flag ? <A /> : <B />}`.

## Komponenten-Props

Eine Komponente liest ihre Props als Werte, wie in React: `props.show.name`.
Hinter jeder Prop übergibt der Compiler den Ausdruck des Attributs, und der
Kernel stellt ihn als Getter bereit, wie Solid es tut. Wo eine Prop gelesen
wird, entscheidet also, was aktualisiert wird:

- Innerhalb von JSX gelesen (`<Text>{props.count}</Text>`), bleibt sie
  reaktiv: Der Text folgt dem Signal hinter der Prop.
- Im Komponentenrumpf gelesen oder destrukturiert
  (`function Label({ count })`), wird sie einmal gelesen, wenn die Komponente
  rendert.

Props dort lesen, wo sie verwendet werden, wenn sie einem Signal folgen sollen.

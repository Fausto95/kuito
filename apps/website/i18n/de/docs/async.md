# Kuito Async-Laufzeit — experimentell

Kuito hat **komponentenbezogene** asynchrone Actions und Ressourcen. Sie sind
im reinen JavaScript-Hermes-Kernel implementiert und werden in Nodes isolierter
VM getestet. Timer, `fetch` und der Rest der Standardbibliothek, auf der sie
aufbauen, sind in [web-apis.md](web-apis.md) aufgeführt, mit dem, was jede nicht
tut.

`async`/`await` funktioniert im App-Code auf beiden Plattformen. App-Bundles
zielen auf ES2022, das Hermes V1 unverändert kompiliert, sodass asynchrone
Funktionen nativ bleiben. Hermes V1 weist asynchrone Generatoren ab
(`async function*` und `for await` über einen solchen); der Bytecode-Compiler
meldet sie zur Build-Zeit, und ein Live Patch, der einen verwendet, lässt sich
auf dem Gerät nicht auswerten.

## Öffentliche API

```tsx
import { task, resource, VStack, Text, Button } from 'kuito';

function Example() {
  const query = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/api', { signal });
    return response.json();
  });

  const save = task(
    async ({ signal }) => {
      await saveChanges({ signal });
    },
    { policy: 'drop' },
  );

  return (
    <VStack>
      <Text>{query.running.value ? 'Loading...' : String(query.data.value ?? '')}</Text>
      <Button
        onPress={() => {
          void save.run().catch(() => {});
        }}
      >
        Save
      </Button>
    </VStack>
  );
}
```

## Ausführung und Lebenszyklus

- `task()` startet erst, wenn seine Methode `run(...args)` aufgerufen wird,
  und gibt bei Fehlschlag normalerweise ein ablehnendes Promise zurück. Der
  Aufrufer behandelt Ablehnungen.
- `resource()` startet nach einem erfolgreichen Patch-Commit und stellt
  `refresh()` bereit. Ressourcenfehler füllen `error.value`, statt eine
  unbehandelte Ablehnung aus dem automatischen Laden zu verursachen.
- Beide stellen persistente Signale `running`, `data` und `error` sowie
  `cancel()` bereit. Task-Policies: `replace` (vorherige abbrechen, letztes
  Ergebnis gewinnt) und `drop` (laufendes Promise wiederverwenden).
- Bei einem kompatiblen Fast Refresh werden alte Async-Records
  invalidiert/abgebrochen, während die Signalobjekte stabil bleiben. Veraltete
  Fortsetzungen können keine Ergebnisse committen. Bei abgewiesenen Patches
  bleibt die alte Arbeit aktiv. Das Entsorgen einer Komponente bricht die
  Arbeit ab.
- Der Abbruch ist kooperativ. Nicht abbrechbare Operationen können zu Ende
  laufen, aber ihre veralteten Ergebnisse aktualisieren nie den Async-Zustand
  von Kuito. Das Signal ist das kernel-eigene `AbortSignal`
  ([web-apis.md](web-apis.md#abortcontroller)), sodass seine Übergabe an
  `fetch` die Anfrage abbricht.
- Ein Task oder eine Ressource behält seinen Slot nach Namen, wie jeder Hook
  (`docs/reactivity.md`): Hooks darum herum hinzuzufügen, zu entfernen oder
  umzuordnen behält seine Signale, und ihn zu entfernen entsorgt ihn.

## Promise-Host-Integration

Die gemeinsame mobile Hermes-Laufzeit ruft jetzt `drainMicrotasks()` nach der
Quellauswertung und dem Event-Dispatch auf. Das ist ein Checkpoint für
Promise-Jobs; es stellt **keine** Event-Loop bereit. Externe native Callbacks
müssen den besitzenden VM-Thread erneut betreten und die Jobs erneut abarbeiten.

Timer-, HTTP- und Modul-Callbacks betreten den VM-Thread als eigene Jobs, jeweils
gefolgt von einem Microtask-Checkpoint.

Aktuelle reaktive UI-Bindungen beobachten die bei ihrer ersten Auswertung
erfassten Abhängigkeiten. Zweigabhängige Signalabhängigkeiten brauchen noch
dynamisches Retracking.

## Nächste native Meilensteine

1. Unabhängige native Worker, Ressourcen-Caching und gemessene Geräteleistung hinzufügen.

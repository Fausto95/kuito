# Einführung

Kuito erstellt native iOS- und Android-Apps aus TypeScript. Komponenten sind TSX, Styles sind CSS, State sind Signals. Das Ergebnis ist UIKit und Android Views: kein Webview, kein React-Renderer.

> Kuito ist experimentell und nicht produktionsreif. APIs und generierte Projekte ändern sich.

## Eine Komponente

```tsx
import { signal, VStack, Text, Button } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

`count` ist ein Signal. `<Text>` liest es, also aktualisiert ein Schreibzugriff dieses eine native Label; die Komponentenfunktion läuft nie erneut.

## So funktioniert es

- **Kompiliert, nicht interpretiert.** TSX und CSS werden zur Build-Zeit kompiliert. Auf dem Gerät läuft kein CSS-Parser.
- **Hermes auf dem Gerät.** Die App läuft im nativen Prozess. Jedes Event sendet einen Batch von View-Mutationen an den UI-Thread.
- **Echte Views.** Jede Komponente ist eine UIKit- oder Android-View, gelayoutet von einer gemeinsamen Engine.
- **Web-APIs.** `fetch`, `WebSocket`, `URL`, Timer und `crypto`, gestützt auf die Plattform.
- **Native Module.** Swift und Kotlin hinter einer TypeScript-Spezifikation; `haptics`, `location`, `storage` und die übrigen sind so gebaut.

Die Seite [Architektur](./architecture.md) erklärt jeden Teil.

## Voraussetzungen

- Node.js 22.18 oder neuer
- iOS: macOS, Xcode, XcodeGen
- Android: JDK 21, Android SDK und NDK, Gradle 8

## Eine App erstellen

```sh
npx kuito doctor
npx kuito create MyApp
cd MyApp
npx kuito dev ios    # or: npx kuito dev android
```

`kuito doctor` meldet, was fehlt. `kuito create` schreibt die App und installiert ihre einzige Abhängigkeit. `kuito dev ios` startet einen Simulator, baut die native Shell, installiert die App und beginnt, deine Dateien zu beobachten.

```text
MyApp/
  app/               file-based routes
    _layout.tsx      tabs
    (home)/index.tsx the first screen
  assets/            icon.png, splash.png
  modules/           the app's own native modules
  kuito.config.ts    name, ids, icon, environments
```

Bearbeite `app/(home)/index.tsx` und speichere: Die laufende App aktualisiert sich an Ort und Stelle und behält ihren State. Kein natives Projekt wird eingecheckt; die CLI generiert die Shells bei jedem Build nach `.kuito/`.

## Weiter

- [App-Projekte](../../../docs/apps.md): Layout, `kuito.config.ts`, Umgebungen
- [Primitives](../../../docs/primitives.md) und [Reaktivität](../../../docs/reactivity.md)
- [Styles](../../../docs/styles.md): das CSS, das Kuito kompiliert
- [CLI](../../../docs/cli.md): jeder Befehl

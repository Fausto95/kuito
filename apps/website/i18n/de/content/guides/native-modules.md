# Native Module

Ein natives Modul ist Plattformcode, den eine App aufruft: eine Swift-Klasse auf iOS, eine Kotlin-Klasse auf Android und eine TypeScript-Spezifikation, die beide deklariert und für die App typisiert. Kuitos eigene Funktionalitäten (`haptics`, `clipboard`, `location`, `storage`, ...) sind auf diese Weise gebaut.

## Eine Funktionalität aufrufen

Jede Funktionalität ist ein Namespace, der seine Funktionen einzeln exportiert, sodass ein Bundle nur die Funktionen behält, die es aufruft.

```tsx
import { Text, clipboard } from 'kuito';

await clipboard.writeText('https://www.tvmaze.com');

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

Eine Aktion ist ein Verb (`haptics.impact('light')`); eine, die auf die Plattform wartet, gibt ein Promise zurück. Eine feste Tatsache ist eine Eigenschaft (`device.model`). Ein Wert, der sich ändert, ist ein Signal (`network.state`): `.value` lesen oder ihm mit `watch` folgen.

## Eine Spezifikation deklarieren

Ein Modul wird einmal deklariert, in TypeScript, und per Id verknüpft. Der Compiler liest die Spezifikation, ohne sie auszuführen, also enthält sie nur Imports, Typen und `defineModule`. Eine mit `type` deklarierte String-Union wird zu einem Enum, ein Objekttyp zu einem Struct oder einer Data Class.

```ts
import { defineModule, event, fn, live } from 'kuito';

export type Reading = { level: number; charging: boolean };

export default defineModule('Battery', {
  read: fn.sync<() => Reading>(),
  charging: live<boolean>(),
  low: event(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.myapp.modules.battery.BatteryModule' },
});
```

| Deklaration        | Läuft auf                                     | JavaScript erhält |
| ------------------ | --------------------------------------------- | ----------------- |
| `fn.sync`          | dem JS-Thread                                 | den Wert          |
| `fn.main`          | dem Main-Thread (UI)                          | ein Promise       |
| `fn.background`    | dem seriellen Hintergrund-Thread des Moduls   | ein Promise       |
| `fn.main.callback` | startet auf seinem Thread, schließt später ab | ein Promise       |

- `event<Payload>()`: `low.addListener(fn)` gibt ein Abonnement zurück; nativ laufen `startLow(emitter)` und `stopLow()` darum herum.
- `live<T>()`: Plattformzustand, als Signal gelesen (`battery.charging.value`); unbeobachtet ruft jeder Lesezugriff `charging()` auf, beobachtet läuft `startCharging(signal)` und `signal.set(value)` schreibt ihn.
- `view<Props, Methods>({ events, methods })`: eine View, die die App in JSX rendert.

Synchrone Funktionen schnell und thread-sicher halten: Sie blockieren JavaScript und dürfen UIKit oder Android Views nicht anfassen.

## Eigene schreiben

Die Module einer App liegen in `modules/`, neben `app/`. Das Verzeichnis ist der Name in Kebab-Case, und die Spezifikation heißt wie es.

```sh
kuito module create Battery
```

Das Gerüst ist `modules/battery/battery.ts`, `ios/BatteryModule.swift` und `android/BatteryModule.kt`. Die Swift-Klasse ist `final` und konformiert zum generierten `BatterySpec`; der Build schlägt fehl und nennt die Anforderung, bis sie jeden Member implementiert.

```swift
final class BatteryModule: BatterySpec {
    init(context: KuitoModuleContext) {}
    func read() throws -> Reading { ... }
    @MainActor func startCharging(_ signal: KuitoSignal<Bool>) { ... }
    @MainActor func stopCharging() { ... }
}
```

Die Kotlin-Klasse nimmt den `KuitoModuleContext` entgegen und implementiert das generierte `BatterySpec` aus `dev.kuito.link`.

`KuitoModuleError("ERR_BUSY", "...")` werfen, um mit einem eigenen Code fehlzuschlagen; jeder andere Fehler kommt als `ERR_NATIVE` an.

## Verwenden

Den Default-Export der Spezifikation importieren und seine Member aufrufen. Ein Modul, das nichts aufruft, wird nicht kompiliert.

```tsx
import Battery from './modules/battery/battery';

const reading = await Battery.read();

<Text>{Battery.charging.value ? 'Charging' : `${Math.round(reading.level * 100)}%`}</Text>;
```

`kuito dev` baut das Modul in die Shell der App. Das Speichern einer `.swift`-, `.kt`- oder `.ts`-Datei unter `modules/` baut die Shell neu; jede andere TypeScript-Änderung bleibt ein Live Patch.

## Views

Ein Modul kann eine `UIView` auf iOS und eine Android-`View` beisteuern, in JSX gerendert wie jedes Primitiv. Sie nimmt Style- und Layout-Props an, und ihre Ereignisse kommen als `on*`-Props an. `Slider` ist auf diese Weise gebaut.

```tsx
import { Slider } from 'kuito';

<Slider flex={1} height={40} value={volume} onChangeEnd={(event) => save(event.value)} />;
```

- Ein Modul hat höchstens eine View: `view: view<SliderProps>({ events: ['change', 'changeEnd'] })`.
- Sie hat keine intrinsische Größe: ihr eine `height` geben. Sie nimmt keine Kinder an.

## Vertiefung

[Native Module](../../../../docs/native-modules.md) behandelt, was der Compiler generiert, das native Schreiben einer View, UI-Thread-Aufrufe, Scope-Effekte, native Anforderungen, Callback-Funktionen, Tests, Fehlercodes und die versionierte Modul-API.

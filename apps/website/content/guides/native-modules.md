# Native modules

A native module is platform code an app calls: a Swift class on iOS, a Kotlin class on Android, and a TypeScript spec that declares both and types them for the app. Kuito's own capabilities (`haptics`, `clipboard`, `location`, `storage`, ...) are built this way.

## Call a capability

Each capability is a namespace exporting its functions one by one, so a bundle keeps only the functions it calls.

```tsx
import { Text, clipboard } from 'kuito';

await clipboard.writeText('https://www.tvmaze.com');

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

An action is a verb (`haptics.impact('light')`); one that waits for the platform returns a Promise. A fixed fact is a property (`device.model`). A value that changes is a signal (`network.state`): read `.value`, or follow it with `watch`.

## Declare a spec

A module is declared once, in TypeScript, and linked by id. The compiler reads the spec without running it, so it holds only imports, types and `defineModule`. A string union declared with `type` becomes an enum, an object type a struct or data class.

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

| Declaration        | Runs on                               | JavaScript gets |
| ------------------ | ------------------------------------- | --------------- |
| `fn.sync`          | the JS thread                         | the value       |
| `fn.main`          | the main (UI) thread                  | a Promise       |
| `fn.background`    | the module's serial background thread | a Promise       |
| `fn.main.callback` | starts on its thread, settles later   | a Promise       |

- `event<Payload>()`: `low.addListener(fn)` returns a subscription; natively, `startLow(emitter)` and `stopLow()` run around it.
- `live<T>()`: platform state read as a signal (`battery.charging.value`); unwatched, each read calls `charging()`, while watched `startCharging(signal)` runs and `signal.set(value)` writes it.
- `view<Props, Methods>({ events, methods })`: a view the app renders in JSX.

Keep synchronous functions fast and thread-safe: they block JavaScript and must not touch UIKit or Android Views.

## Write your own

An app's modules live in `modules/`, beside `app/`. The directory is the name in kebab case, and the spec is named like it.

```sh
kuito module create Battery
```

The scaffold is `modules/battery/battery.ts`, `ios/BatteryModule.swift` and `android/BatteryModule.kt`. The Swift class is `final` and conforms to the generated `BatterySpec`; the build fails, naming the requirement, until it implements every member.

```swift
final class BatteryModule: BatterySpec {
    init(context: KuitoModuleContext) {}
    func read() throws -> Reading { ... }
    @MainActor func startCharging(_ signal: KuitoSignal<Bool>) { ... }
    @MainActor func stopCharging() { ... }
}
```

The Kotlin class takes the `KuitoModuleContext` and implements the generated `BatterySpec`, from `dev.kuito.link`.

Throw `KuitoModuleError("ERR_BUSY", "...")` to fail with your own code; any other error arrives as `ERR_NATIVE`.

## Use it

Import the spec's default and call its members. A module that nothing calls isn't compiled.

```tsx partial
import { Text } from 'kuito';
import Battery from './modules/battery/battery';

export function BatteryLabel() {
  const reading = Battery.read();
  return <Text>{Battery.charging.value ? 'Charging' : `${Math.round(reading.level * 100)}%`}</Text>;
}
```

`kuito dev` builds the module into the app's shell. Saving a `.swift`, `.kt` or `.ts` file under `modules/` rebuilds the shell; any other TypeScript change stays a Live Patch.

## Views

A module can contribute a `UIView` on iOS and an Android `View`, rendered in JSX like any primitive. It takes style and layout props, and its events arrive as `on*` props. `Slider` is built this way.

```tsx
import { Slider, signal, storage } from 'kuito';

export function Volume() {
  const volume = signal(0.5);
  return (
    <Slider
      flex={1}
      height={40}
      value={volume.value}
      onChange={(value) => (volume.value = value)}
      onChangeEnd={(event) => storage.set('volume', String(event.value))}
    />
  );
}
```

- A module has at most one view: `view: view<SliderProps>({ events: ['change', 'changeEnd'] })`.
- It has no intrinsic size: give it a `height`. It takes no children.

## In depth

[Native modules](../../../../docs/native-modules.md) covers what the compiler generates, writing a view natively, UI-thread calls, scope effects, native needs, callback functions, testing, error codes and the versioned module API.

# Write a native module

Use a native module to expose a platform SDK, hardware feature or native view to TypeScript. A module has one TypeScript spec plus Swift and Kotlin implementations. The spec generates the types and link table; an app does not maintain a separate native registry.

For existing device features, start with the built-in namespaces such as `clipboard`, `location`, `audio` or `storage`. Write a module when the built-in API does not cover your integration.

## Scaffold the files

```sh
kuito module create Battery
```

```text
modules/battery/
  battery.ts
  ios/BatteryModule.swift
  android/BatteryModule.kt
```

The directory and spec filename use the module name in kebab case. The scaffold provides working native implementations. Replace its spec and both classes together; a missing protocol method fails the platform build.

## Define the TypeScript contract

This battery integration exposes a one-shot reading and a live low-power flag. Put it in `modules/battery/battery.ts`:

```ts
import { defineModule, fn, live } from 'kuito';

export type Reading = { level: number; charging: boolean };

export default defineModule('Battery', {
  /** Low Power Mode on iOS, Battery Saver on Android. */
  lowPower: live<boolean>(),
  /** The charge from 0 to 1, or -1 when unknown. */
  read: fn.main<() => Promise<Reading>>(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.myapp.modules.battery.BatteryModule' },
});
```

Keep specs declarative: imports, type definitions and `defineModule`. The compiler reads them without executing arbitrary app code. Named string unions generate native enums; object types generate native structs/data classes. Functions, `Date` instances and arbitrary class instances cannot cross as data. Use primitives, declared objects, arrays, records, `Json` or `ArrayBuffer` as appropriate.

| Factory                                       | Use case                                     | JavaScript result                       |
| --------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| `fn.sync`                                     | Fast, thread-safe read on the JS thread      | Direct value                            |
| `fn.main`                                     | UIKit/Android View work                      | Promise                                 |
| `fn.background`                               | Serial native background work                | Promise                                 |
| `fn.main.callback` / `fn.background.callback` | Native callback-based operation              | Promise settled through `KuitoPromise`  |
| `event<Payload>()`                            | Discrete notification                        | `addListener`, returning a subscription |
| `live<T>()`                                   | Observable platform state                    | Read-only signal                        |
| `motion<T>()`                                 | A platform value updated every frame         | Read-only motion value                  |
| `view<Props, Methods>()`                      | A native view with props, events and methods | JSX component                           |

`fn.sync` blocks JavaScript and must not touch platform views. Main/background functions preserve their thread's call ordering. Direct `fn.main` calls can execute immediately from compiler-placed UI-thread code; callback operations and other calls require the normal asynchronous path. See [placement](placement.md).

## Implement iOS

Put this in `ios/BatteryModule.swift`:

```swift
import UIKit

final class BatteryModule: BatterySpec {
    private var observer: NSObjectProtocol?

    init(context: KuitoModuleContext) {}

    // ProcessInfo is thread-safe, so the read runs on the JS thread.
    func lowPower() -> Bool {
        ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    @MainActor func read() -> Reading {
        let device = UIDevice.current

        device.isBatteryMonitoringEnabled = true

        return Reading(level: Double(device.batteryLevel), charging: device.batteryState == .charging)
    }

    @MainActor func startLowPower(_ signal: KuitoSignal<Bool>) {
        observer = NotificationCenter.default.addObserver(
            forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main
        ) { _ in signal.set(ProcessInfo.processInfo.isLowPowerModeEnabled) }
    }

    @MainActor func stopLowPower() {
        observer.map(NotificationCenter.default.removeObserver)
        observer = nil
    }
}
```

`BatterySpec` and `Reading` are generated into the app target. `startLowPower` begins observing when the first subscriber arrives; `stopLowPower` releases the observer when the last leaves or the runtime stops. Unobserved reads call `lowPower()` synchronously.

For callback APIs, resolve or reject the generated `KuitoPromise` exactly once. Throw `KuitoModuleError(code, message)` for a specific error code; other exceptions become `ERR_NATIVE`.

## Implement Android

Put this in `android/BatteryModule.kt`, matching the package declared in the spec:

```kotlin
package com.example.myapp.modules.battery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager
import dev.kuito.link.BatterySpec
import dev.kuito.link.Reading
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext

class BatteryModule(context: KuitoModuleContext) : BatterySpec {
    private val app = context.applicationContext
    private val power = app.getSystemService(PowerManager::class.java)
    private var receiver: BroadcastReceiver? = null

    override fun lowPower() = power.isPowerSaveMode

    override fun read(): Reading {
        val battery = app.getSystemService(BatteryManager::class.java)

        return Reading(
            level = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) / 100.0,
            charging = battery.isCharging,
        )
    }

    override fun startLowPower(signal: KuitoSignal<Boolean>) {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) = signal.set(power.isPowerSaveMode)
        }.also { app.registerReceiver(it, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)) }
    }

    override fun stopLowPower() {
        receiver?.let(app::unregisterReceiver)
        receiver = null
    }
}
```

Use `context.applicationContext` for work that can outlive an Activity. A background task may have no foreground Activity; operations requiring one must report that condition. Release native resources in `destroy()` and stop listeners in their generated stop methods.

## Call the module

From a screen, import the spec's default export. Read `Battery.lowPower.value` in JSX to follow system changes; call `await Battery.read()` inside a task or handler for the current charge. Handle `level === -1` as unknown. The result is a normal typed object.

Only modules used by the bundle are linked. Importing a spec does not instantiate the native class; its first call or observation does. Changing a module spec, Swift or Kotlin file rebuilds the shell during `kuito dev`.

## Add a native view

A module can declare one `view` member. Declare its props, event payloads and methods in the spec, then return a `KuitoModuleView` from each platform implementation. Use the existing [slider module](../native/modules/slider/slider.ts) as a small working example and the [WebView module](../native/modules/webview/webview.ts) for imperative methods.

- Construct the view on the main thread. The generated event props become `onChange`, `onLoad`, and similar JSX callbacks.
- Give custom views explicit dimensions; they have no automatic intrinsic measurement. A child-hosting view must implement the renderer's host contract.
- Accept optional prop values to restore defaults when a prop is removed. Register color props with the color decoder, not a generic string parser.
- Emit events for user input, not for prop writes. On Android, check `fromUser` or suppress the listener while applying a value.
- Release camera sessions, players and other resources in `unmount`. Leaving the window during navigation does not necessarily unmount the view.
- Methods resolve a mounted view before calling the platform implementation; a stale ref fails with `ERR_VIEW_NOT_FOUND`.

## Declare native requirements

Put dependencies and manifest requirements in the spec. Generated native projects are disposable.

| null>>(),
ios: {
class: 'CameraModule',
swiftPackages: [
{ url: 'https://github.com/example/Lens.git', from: '2.1.0', products: ['Lens'] },
],
infoPlist: { NSCameraUsageDescription: 'Scan codes to join a list' },
},
android: {
class: 'com.example.myapp.modules.camera.CameraModule',
dependencies: ['androidx.camera:camera-camera2:1.4.1'],
permissions: ['android.permission.CAMERA'],
features: [{ name: 'android.hardware.camera.any', required: false }],
providers: [
{
name: 'com.example.myapp.modules.camera.CaptureProvider',
authorities: '${applicationId}.camera',
exported: 'false',
grantUriPermissions: 'true',
resources: { 'android.support.FILE_PROVIDER_PATHS': '@xml/camera_paths' },
},
],
},
});

```

Include `ios/` or `android/` sources for every platform section you declare. Android `res/` resources join the app's resource namespace; prefix names to avoid collisions. Two modules cannot supply conflicting Info.plist values. Permission reasons declared by the app replace module defaults.

A module with `launch: true` implements a static Swift `@MainActor launch()` or a Kotlin companion `launch(application: Application)`. The shell calls it during app launch, before the runtime starts. Use it only for APIs requiring early registration, and keep it short.

## Handle errors and binary data

<!-- error codes: generated from src/protocol/modules.ts -->

| Code                     | Meaning                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `ERR_FUNCTION_NOT_FOUND` | The shell's link table doesn't hold the function: rebuild it.                        |
| `ERR_VIEW_NOT_FOUND`     | A view function's view is not mounted.                                               |
| `ERR_ARGUMENT`           | An argument didn't decode into the declared type.                                    |
| `ERR_ENCODE`             | A result or event payload isn't plain data of the declared type.                     |
| `ERR_NATIVE`             | The function threw something other than `KuitoModuleError`.                          |
| `ERR_THREAD`             | A synchronous call reached an asynchronous function.                                 |
| `ERR_NO_ACTIVITY`        | The module needs the activity, and a background task runs without one. Android only. |

<!-- end of generated error codes -->

Synchronous failures throw; asynchronous failures reject. Errors include the module, member and code. Listener exceptions are reported without preventing other listeners from running.

`ArrayBuffer` crosses as bytes. Native-returned writable buffers can be shared; JavaScript-owned buffers are copied into native-owned memory. Do not mutate a buffer while native code is still using it, and do not return read-only mapped memory as a writable buffer.

## Test and distribute

Test JavaScript behavior with native fakes through [kuito/tests](testing.md). Build and run both platform implementations to verify permissions, threading, event cleanup and view behavior. Headless tests do not execute Swift or Kotlin.

The documented spec factories and generated native protocols form module API version 1. Host function names and link IDs are implementation details. To share the module between apps, follow [package a module](module-packaging.md).
```

# Crash reports

A [release build](cli.md#release-builds) has no LogBox. What an installed app
throws or crashes on is recorded on the device instead, handed to the adapter
of a hosted crash service if the app has one, and mapped back to the app's
TSX by `kuito symbolicate`. Debug builds show the same errors in the
[LogBox](logbox.md) and record none.

## What is recorded

| Source                                                                                          | `kind`       | `fatal` | When it reaches an adapter        |
| ----------------------------------------------------------------------------------------------- | ------------ | ------- | --------------------------------- |
| The app or the kernel throwing while it starts                                                  | `javascript` | `true`  | At once                           |
| A throw in an event handler, timer or `fetch` callback, an unhandled rejection, `console.error` | `javascript` | `false` | At once                           |
| A failure of the shell itself, like a prop the renderer rejects                                 | `native`     | `false` | At once                           |
| Hermes itself failing to start, without a JavaScript stack                                      | `native`     | `true`  | At once                           |
| An uncaught Objective-C exception (iOS), Kotlin or Java exception (Android)                     | `native`     | `true`  | At the next launch                |
| A crash MetricKit reports (iOS: signals, `EXC_BAD_ACCESS`, Swift traps)                         | `native`     | `true`  | At the next launch, from a device |
| A native crash or an ANR the system records (Android 11 and later)                              | `native`     | `true`  | At the next launch                |

`console.error` is recorded too: the host log does not tell it from an
uncaught error. An error repeated with the same message and stack, like one
thrown every frame, is kept once, and when more than 20 wait, the oldest
non-fatal ones go first. MetricKit collects diagnostics only from users who
share analytics with app developers (Settings › Privacy & Security ›
Analytics & Improvements), so most iOS signal crashes reach an adapter only
through the service's own SDK. Each report is JSON, the same on both platforms:

```json
{
  "id": "0DC27628-987B-4ED9-BBEC-E3CFB2A77295",
  "kind": "javascript",
  "fatal": false,
  "message": "Error: boom: pressed",
  "stack": "Error: boom: pressed\n    at explode (address at kuito://app:1:38393)\n    ...",
  "time": "2026-10-21T14:14:56Z",
  "app": { "id": "com.example.reel", "version": "1.0.0", "build": "1" },
  "platform": "ios",
  "os": "27.0.0",
  "device": "iPhone18,2"
}
```

A report is written to the app's own storage first (Application Support on
iOS, the app's files on Android), so one that the process does not survive
is still there at the next launch. It is removed once an adapter has it;
without one, the newest 20 wait.

## Adapters

An adapter for a hosted service (Sentry, Bugsnag, your own endpoint) is an
ordinary [native module](native-modules.md) in the app's `modules/`. Kuito
ships none. Its native class implements `KuitoCrashReporter` and adds itself
to `KuitoCrashReports` when the app starts it, usually with the service's
key:

```ts
// modules/crash-service/crash-service.ts
import { defineModule, fn } from 'kuito';

export default defineModule('CrashService', {
  /** Starts the service with its key; reports reach it from then on. */
  start: fn.main<(key: string) => Promise<void>>(),
  ios: { class: 'CrashServiceModule' },
  android: { class: 'com.example.myapp.modules.crashservice.CrashServiceModule' },
});
```

```swift
final class CrashServiceModule: CrashServiceSpec, KuitoCrashReporter {
    init(context: KuitoModuleContext) {}

    @MainActor func start(_ key: String) {
        // Configure the service's SDK with `key` here.
        KuitoCrashReports.shared.add(self)
    }

    func report(_ report: KuitoCrashReport) {
        // Hand `report` to the service: its JSON is the shape above.
    }
}
```

```kotlin
package com.example.myapp.modules.crashservice

import dev.kuito.link.CrashServiceSpec
import dev.kuito.runtime.KuitoCrashReport
import dev.kuito.runtime.KuitoCrashReporter
import dev.kuito.runtime.KuitoCrashReports
import dev.kuito.runtime.modules.KuitoModuleContext

class CrashServiceModule(context: KuitoModuleContext) : CrashServiceSpec, KuitoCrashReporter {
    override fun start(key: String) {
        KuitoCrashReports.add(this)
    }

    override fun report(report: KuitoCrashReport) {
        // report.toJson() is the shape above.
    }
}
```

`add` hands over the reports still waiting, oldest first, then each new one,
on the main thread. A waiting report goes to the adapters added by then and is
removed before it is handed on, so with two services, add both before either
starts; an adapter that throws on Android is skipped. Declare `start` as `fn.main` so it runs there, and call it
as early as the app starts: a report of an error before then waits for it.
`remove` stops the deliveries. The service's own SDK may catch native crashes
itself; the reports here add the JavaScript errors it cannot see.

## Symbolication

Release bytecode carries no debug info, so a release stack names bytecode
offsets: `address at kuito://app:1:38393`. A release build keeps, for each
script, Hermes's map from those offsets to the bundle and the bundle's map to
your files, in `.kuito/sourcemaps/<platform>/<version>-<buildNumber>/`. They
never go in the app, which would hand out its source. Keep that directory for
every build you ship: it is what turns a report back into your code. A
release build with the same `version` and `buildNumber` replaces them, and a
report of the shipped build would then resolve against code it never ran:
raise `buildNumber` before you rebuild what you ship.

```sh
kuito symbolicate crash.json
```

```
  ✖ Error: boom: pressed
  ◇ javascript  ios 1.0.0 (1) · 2026-10-21T14:14:56Z
    at explode  app/crash.tsx:4:13
    at anonymous  app/crash.tsx:14:58
    at anonymous  (kuito)
```

It finds the maps by the report's platform, version and build number, which
is why every upload needs its own `buildNumber`. A report from a shell running
an [over-the-air update](updates.md) also names the update as `app.update`,
and resolves with the maps `kuito update build` kept for it in
`.kuito/sourcemaps/<platform>/update-<id>/`. UI-thread frames resolve too:
a `kuito://ui/<hash>` frame through the maps of the app's UI bundle
(`app-ui.hbc`) to the file the function was written in. Frames in the kernels
resolve to Kuito's own files: a `kuito://bootstrap` frame through the
kernel's maps (`bootstrap.hbc`) to `src/runtime`, a `kuito://ui-kernel`
frame through the UI kernel's (`ui.hbc`) to `src/ui-thread`. Code the bundler
wrote, like the entry wrapper, shows as `(kuito)`. A `native` report prints its
stack as the platform wrote it: resolving that needs the build's dSYM (iOS)
or R8 mapping (Android), which this command does not read.

## Not covered yet

- Native stacks are not symbolicated: dSYMs and R8's `mapping.txt` stay with
  Xcode and Gradle's outputs.
- MetricKit delivers diagnostics on devices only, so iOS signal crashes are
  not recorded on a simulator.
- An app launched only for a background task (docs/background-tasks.md)
  installs no hook until its UI starts.
- A native crash recorded at the next launch carries that launch's version,
  and on iOS the end of MetricKit's reporting window as its time.

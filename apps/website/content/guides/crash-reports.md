# Crash reports

A release build has no LogBox: what an installed app throws or crashes on is recorded on the device, handed to a crash service's adapter if the app has one, and mapped back to your TSX by `kuito symbolicate`.

**Use it for**

- Sending the app's JavaScript errors to Sentry, Bugsnag or your own endpoint.
- Reading a stack from a release build as lines of your source.

Debug builds show the same errors in the [LogBox](./logbox.md) and record none.

## Read a report

```sh
kuito symbolicate crash.json
```

```text
  ✖ Error: boom: pressed
  ◇ javascript  ios 1.0.0 (1) · 2026-10-21T14:14:56Z
    at explode  app/crash.tsx:4:13
    at anonymous  app/crash.tsx:14:58
```

It finds the source maps a release build kept in `.kuito/sourcemaps/<platform>/<version>-<buildNumber>/`, by the report's platform, version and build number. Keep that directory for every build you ship, and raise `buildNumber` before rebuilding what you ship: a rebuild with the same numbers replaces the maps. A report from a launch that ran an [over-the-air update](./updates.md) resolves with that update's maps.

A report is JSON, the same on both platforms:

```json
{
  "id": "0DC27628-987B-4ED9-BBEC-E3CFB2A77295",
  "kind": "javascript",
  "fatal": false,
  "message": "Error: boom: pressed",
  "stack": "Error: boom: pressed\n    at explode (address at kuito://app:1:38393)",
  "time": "2026-10-21T14:14:56Z",
  "app": { "id": "com.example.reel", "version": "1.0.0", "build": "1" },
  "platform": "ios",
  "os": "27.0.0",
  "device": "iPhone18,2"
}
```

## What is recorded

| Source                                                                                       | `kind`       | `fatal` | Reaches an adapter |
| -------------------------------------------------------------------------------------------- | ------------ | ------- | ------------------ |
| The app or the kernel throwing while it starts                                               | `javascript` | `true`  | At once            |
| A throw in a handler, a timer or a `fetch` callback, an unhandled rejection, `console.error` | `javascript` | `false` | At once            |
| A failure of the shell itself, like a prop the renderer rejects                              | `native`     | `false` | At once            |
| An uncaught Objective-C, Kotlin or Java exception                                            | `native`     | `true`  | At the next launch |
| iOS: a crash MetricKit reports, on devices only                                              | `native`     | `true`  | At the next launch |
| Android 11 and later: a native crash or an ANR                                               | `native`     | `true`  | At the next launch |

A report is written to the app's storage first, so it survives a crash. It is removed once an adapter has it; without one, 20 wait, and fatal reports are kept over the others. An error repeated right after itself, with the same message and stack, is kept once.

## Send reports to a service

An adapter is an ordinary [native module](./native-modules.md) in the app's `modules/`; Kuito ships none. Its native class implements `KuitoCrashReporter` and adds itself to `KuitoCrashReports` when the app starts it:

```ts
// modules/crash-service/crash-service.ts
import { defineModule, fn } from 'kuito';

export default defineModule('CrashService', {
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
        // Hand `report` to the service.
    }
}
```

On Android the class implements `KuitoCrashReporter` the same way and calls `KuitoCrashReports.add(this)`. `add` hands over the reports still waiting, oldest first, then each new one, on the main thread. Call `start` as early as the app starts: a report waits until then.

## Not covered yet

- Native stacks print as the platform wrote them: `kuito symbolicate` does not read dSYMs or R8's `mapping.txt`.
- MetricKit reports only from devices, and only from users who share analytics with developers.

## Related

- [Release builds and signing](./release-builds.md)
- [Over-the-air updates](./updates.md)
- [Crash reports in depth](../../../../docs/crash-reports.md): the Kotlin adapter, how frames resolve, every limit

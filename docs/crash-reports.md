# Diagnose a release crash

Release builds record JavaScript errors and supported native failures on the device. Use a report and the matching source maps to find the original source location. Debug builds use [LogBox](logbox.md) instead and do not record release reports.

## Resolve a JavaScript stack

```sh
kuito symbolicate crash.json
```

Run this in the app project with the report saved as `crash.json`. The command selects maps under `.kuito/sourcemaps/<platform>/<version>-<buildNumber>/`. For an OTA report it selects the update's maps.

Archive source maps for every shipped build and update. Increment `buildNumber` before producing another distributed build; rebuilding with the same version and number replaces those maps.

A report has this shape:

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

The example identifiers and device details are illustrative. Native stacks remain platform stacks: `symbolicate` does not consume dSYMs or R8 mapping files.

## Connect a reporting service

Kuito does not include a Sentry, Bugsnag or other service adapter. Implement one as an app [native module](native-modules.md), initialize the service SDK, then register a reporter:

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

On Android, implement `KuitoCrashReporter` and call `KuitoCrashReports.add(this)`. Start the adapter early. Registration delivers queued reports oldest first, followed by new reports, on the main thread. The adapter is responsible for forwarding each report to its service.

## Know what is captured

| Failure                                                         | Delivery                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| JavaScript startup exception                                    | Fatal report immediately                                          |
| Handler/timer exception, unhandled rejection or `console.error` | Nonfatal report immediately                                       |
| Renderer/native validation error                                | Nonfatal report immediately                                       |
| Uncaught Objective-C, Kotlin or Java exception                  | Fatal report on the next launch                                   |
| iOS MetricKit crash                                             | On a later launch, when available from a device sharing analytics |
| Android 11+ native crash or ANR                                 | On the next launch                                                |

Reports are persisted before delivery. Without an adapter, up to 20 wait, favoring fatal reports. Consecutive duplicate message/stack pairs are coalesced. Reports are removed from Kuito's queue once handed to an adapter.

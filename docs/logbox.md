# Find and fix runtime errors

LogBox displays development warnings and errors on the device and maps stack frames back to your source. Use it when a tap fails, a promise rejects, or a Live Patch cannot run.

## Reproduce an error

```tsx
import { Button } from 'kuito';

export function ErrorDemo() {
  return (
    <Button
      onPress={() => {
        throw new Error('Example failure');
      }}
    >
      Trigger error
    </Button>
  );
}
```

Tap the button, then tap the error bar above the home indicator. The inspector shows the message, source line and call stack. Repeated messages show a count. Tap a source location to open your editor; use **Copy** to collect the message and stack for a bug report.

| Source                                     | What appears                  |
| ------------------------------------------ | ----------------------------- |
| `console.warn`                             | Warning                       |
| `console.error`                            | Error                         |
| Handler/timer throw or unhandled rejection | Error and stack               |
| Startup or Live Patch exception            | Inspector opens automatically |

An unsuccessful patch leaves the previous app version running. Fix the source and save; a successful patch closes the failure inspector. **Reload** starts a fresh runtime and clears entries.

## Choose an editor

```sh
KUITO_EDITOR="code --reuse-window" kuito dev ios
```

The dev server opens files inside the project. Without `KUITO_EDITOR`, it tries a graphical `VISUAL` or `EDITOR`, then VS Code. Supported editors include VS Code, Cursor, Zed, Sublime, WebStorm, IntelliJ and Android Studio.

## Follow ordinary logs

`console.log`, `info` and `debug` appear in the development terminal and platform logs without creating error cards. `warn` and `error` also create LogBox entries. Values include object contents and circular-reference markers.

Release builds have no LogBox. Use [crash reports](crash-reports.md) and platform logs for shipped apps.

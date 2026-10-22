# Debug an app

Use the development menu to inspect a running app, reload it, or diagnose a lost connection. Start the app with `kuito dev ios` or `kuito dev android`; these tools are available in development builds.

## Open the menu

| Device               | Shortcut                              |
| -------------------- | ------------------------------------- |
| Any connected device | Press `m` in the `kuito dev` terminal |
| iOS Simulator        | ⌘D                                    |
| Android emulator     | ⌘M / Ctrl+M or the menu key           |
| Physical phone       | Shake the device                      |

Choose **Reload** for a fresh runtime, **Reconnect** for a new connection, or inspect the last patch error. The connection panel shows retries and the current server URL. A disconnected app retries automatically with backoff; restarting the dev server usually needs no action on the device.

## Inspect state and view updates

Press `k` in the terminal to open the Components panel. Select a component to see its props, named signals, owners and native views. Use **Select on device**, then tap a view to find the component responsible for it.

For example, if tapping “Like” updates a whole card, select the changed view and inspect the binding behind its prop. The panel shows the signals it read and the write that caused the update. **Highlight updates** in the native menu flashes changed views and labels the signal writes responsible.

Editable signal values accept JSON. Changing one has the same effect as assigning `.value`; computed values are read-only. View-prop edits last until a binding next writes that prop. The History panel retains the last 500 component-owned signal writes; it is a diagnostic history, not a time-travel debugger.

## Set a breakpoint

Press `j` for the JavaScript runtime or `u` for the UI runtime. Chrome DevTools opens with source maps for your TypeScript. Use **Sources** for breakpoints, **Console** for expressions, **Performance** for a CPU profile and **Memory** for heap snapshots. Live Patch continues while DevTools is attached.

Kuito uses an installed Chromium-based browser. To select one explicitly:

```sh
KUITO_DEVTOOLS_BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" kuito dev ios
```

Debugger URLs contain a session token. Open them through the CLI; `chrome://inspect` cannot supply the token. The debugger can execute code in the app and read project files.

## Read the performance monitor

Enable **Performance monitor** in the menu. It shows FPS, the longest main-thread work in the recent interval, dropped frames, prop parses and touch-to-screen latency. Its last line names work recorded during the latest dropped frame. The overlay itself costs frame time; turn it off for benchmarks.

See [performance](performance.md) for interpreting frame reports and [LogBox](logbox.md) for errors. For phone connection setup, see [develop on a phone](phone-live-patch.md).

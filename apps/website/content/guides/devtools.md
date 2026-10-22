# Devtools

Development builds of the Kuito shells carry a dev menu, two on-screen monitors, a Components panel and Chrome DevTools for both of the app's runtimes; release builds carry none of them.

**Use it for**

- Seeing the frame rate and how long the main thread works, while you use the app.
- Finding the views that update too often, and the signal write behind each update.
- Breakpoints, profiles and heap snapshots in your TypeScript.

## Open them

| Where               | How                                |
| ------------------- | ---------------------------------- |
| iOS simulator       | ⌘D                                 |
| Android emulator    | ⌘M / Ctrl+M, or the menu key       |
| A physical device   | Shake it                           |
| The `kuito dev` CLI | Press `m` (works for every device) |

They open as a native sheet: the connection to the dev server, Reload and Reconnect, the last Live Patch updates, the last error, the dev server URL, and two switches for the monitors, remembered across launches. There is no floating button.

`kuito dev` takes one key per tool: `m` the dev menu, `j` DevTools on the JS thread, `u` on the UI thread, `k` the Components panel, `l` logs, `r` relaunch, `s` save a recording for a golden test, `?` the full list.

## Read the performance monitor

```text
60 fps
UI · 3.1 ms · 2 dropped
JS · 1 parses/commit · touch 9 ms (p95 14)
JSON · 0.0 parses/frame · 0 B/frame
```

- **fps**: UI-thread frames per second, against the display's target, with a graph of the last 15 seconds.
- **UI**: the longest the main thread worked between two frames in the last half second. It measures work, not the frame interval, so an idle app reads near 0 ms. Then the frames dropped since the monitor opened.
- **JS**: Kuito's commits: prop parses per commit, and the last touch-to-screen latency with its 95th percentile.
- **JSON**: JSON parsed and made per frame across the boundaries between JavaScript, C++ and the renderer. It should stay near 0.
- **The last line** is the last dropped frame's receipt: what the main thread did in it, and which job asked for it.

Drag the monitor anywhere; it settles in the nearest corner. A frame whose own UI-thread code runs past 4 ms also shows a warning in the LogBox that names the line ([Placement report](./placement.md#find-a-slow-ui-thread-frame)).

## See what re-renders

**Highlight updates** flashes every view the renderer updates: green, then amber, then red as the same view keeps updating within a second, with a ×N count. Under each flash is the signal write that caused it (`visits = 2`). Constant red means something updates more than it should.

Both monitors redraw the window themselves, so they cost some frame time of their own: turn them off to measure.

## Inspect components and signals

Press `k` in `kuito dev` for the Components panel: Kuito's own model of the app, signal to binding to view.

- **Tree**: every mounted component, named as you declared it. Hovering one outlines its views on the device.
- **Component**: its props, its hooks by name (`const visits = signal(1)` shows as `visits`), its owners and its views.
- **View**: each prop with the binding behind it and the signals its last run read. **Select on device**, then tap a view.
- **Signal**: every prop and branch it drives.
- **Editing**: values are JSON; Enter sets one, as if your code had written `.value`.
- **History**: the last 500 writes of the signals components own, newest first.

The panel reads the app only when it asks, so it costs nothing while nobody looks.

## Debug with Chrome DevTools

Press `j` for the JS thread (your app and the kernel) or `u` for the UI thread (motion values, gestures, UI-thread callbacks). DevTools opens in a Chromium-based browser of its own, with a dedicated profile under `.kuito/devtools-browser`; `KUITO_DEVTOOLS_BROWSER` picks the executable.

- **Sources**: your TypeScript through source maps, with breakpoints and `debugger;`. Live Patch keeps working while attached.
- **Console**: `console.*` output, linked to its line, including the last 1000 entries from before DevTools opened.
- **Performance** records a CPU profile; **Memory** takes a heap snapshot.

The dev server takes a session token that `kuito dev` hands to the windows it opens, so `chrome://inspect` finds no targets.

## Limits

- Breakpoints in a file you edit are dropped when its Live Patch lands.
- UI-thread code shows as generated JavaScript: it has no source map yet.
- The runtime that runs background tasks is not debuggable.
- One DevTools window debugs a runtime at a time.

## Related

- [LogBox](./logbox.md): errors and warnings, with their source
- [Placement report](./placement.md): what runs on the UI thread
- [Performance](./performance.md): benchmarks and kernel counters
- [Devtools in depth](../../../../docs/devtools.md): the dev link, recordings, how the inspector relays CDP

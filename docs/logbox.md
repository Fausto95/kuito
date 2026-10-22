# LogBox

Development builds show what your app logs and throws, on the device and in
the terminal, mapped back to your TSX. A [release build](cli.md#release-builds)
has no LogBox: what the app logs goes to Xcode's console and logcat, and what
it throws or crashes on is recorded as a [crash report](crash-reports.md).

## console

`console.log`, `info`, `debug`, `warn` and `error` work on device Hermes.
Values print on one line the way Node prints them (`{ a: 1, b: [1, 'two'] }`,
`[Circular]`, `[Function name]`), and every entry also appears:

- in the `kuito dev` terminal, at the line that logged it:

  ```
  12:39:27  › hello { taps: 0 }                     src/App.tsx:14
  12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
  12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
  ```

- in Xcode's console and logcat (tag `Kuito`).

## What the LogBox catches

| Source                                                                      | Shown as                      |
| --------------------------------------------------------------------------- | ----------------------------- |
| `console.warn`                                                              | warning                       |
| `console.error`                                                             | error                         |
| A throw in an event handler, timer or `fetch` callback                      | error                         |
| An unhandled promise rejection                                              | error                         |
| A Live Patch, or your app at startup, that throws                           | failed to run                 |
| A frame Kuito's work dropped ([its receipt](performance.md#frame-receipts)) | warning, at most one a second |

Warnings and errors collect in a bar above the home indicator: the newest
entry, how many errors and warnings are waiting, and a ✕ to clear them. Tap it
to inspect. Code that **failed to run** opens the inspector by itself — the
previous version of the app stays live behind it — and the inspector closes
on its own when a Live Patch fixes the code.

## The inspector

- **The message**, and for a repeat of the same entry how many times it
  happened (×3) instead of three copies.
- **The code frame**: the failing line of your source, lit, with the location
  as a link that opens your editor there.
- **The call stack**, mapped through the Live Patch source maps. Your frames
  come first; Kuito's and libraries' frames fold behind "Show N Kuito and
  library frames". Tap any frame to open it in your editor.
- **Dismiss / Copy / Reload.** Copy puts the message, location, code frame and
  stack on the clipboard as text, ready for an issue or a chat. Reload restarts
  the app in a fresh runtime and clears the LogBox.
- **‹ ›** pages through the entries.

## Opening frames in your editor

The dev server launches the editor, so it works from a simulator, an emulator
or a device. Set `KUITO_EDITOR` to choose it (`code`, `cursor`, `zed`,
`subl`, `webstorm`, `idea`, `studio`, …, with flags if you like:
`KUITO_EDITOR="code --reuse-window"`); otherwise a graphical `VISUAL` or
`EDITOR`, then VS Code. Only files inside the project open.

## How it works

The kernel installs `console` when the native host provides `__kuitoHostLog`;
each entry carries a stack (an `Error` argument's own, or the call site's).
Errors thrown by callbacks the native host starts (events, timers, fetch) go
through the same log, as do Hermes' unhandled rejections. The shell shows
warnings and errors and sends every entry to the dev server, which maps the
stack through the source map of the bundle that ran it and answers with
frames and a code frame: a Live Patch (`kuito://patch/N`), the UI bundle a
UI-thread function runs from (`kuito://ui/<hash>`), or the bytecode the
shell was built with, which a debug shell names by the script it was compiled
from under `.kuito/mobile` and whose map the CLI writes beside it. A frame already at a file of your
project, as a [UI-thread budget](placement.md#time-on-the-ui-thread) warning
carries, is its own source.

# LogBox

Development builds show what your app logs and throws, on the device and in the terminal, mapped back to your TSX.

## console

`console.log`, `info`, `debug`, `warn` and `error` work on device Hermes. Values print on one line the way Node prints them (`{ a: 1, b: [1, 'two'] }`, `[Circular]`, `[Function name]`), and every entry also appears in Xcode's console and logcat (tag `Kuito`), and in the `kuito dev` terminal, at the line that logged it:

```text
12:39:27  › hello { taps: 0 }                     src/App.tsx:14
12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
```

## What the LogBox catches

| Source                                                 | Shown as      |
| ------------------------------------------------------ | ------------- |
| `console.warn`                                         | warning       |
| `console.error`                                        | error         |
| A throw in an event handler, timer or `fetch` callback | error         |
| An unhandled promise rejection                         | error         |
| A Live Patch, or your app at startup, that throws      | failed to run |

Warnings and errors collect in a bar above the home indicator: the newest entry, how many errors and warnings are waiting, and a ✕ to clear them. Tap it to inspect. Code that failed to run opens the inspector by itself, the previous version of the app stays live behind it, and the inspector closes on its own when a Live Patch fixes the code.

## The inspector

- The message, and for a repeat of the same entry how many times it happened (x3) instead of three copies.
- The code frame: the failing line of your source, lit, with the location as a link that opens your editor there.
- The call stack, mapped through the Live Patch source maps. Your frames come first; Kuito's and libraries' frames fold behind "Show N Kuito and library frames". Tap any frame to open it in your editor.
- Dismiss / Copy / Reload. Copy puts the message, location, code frame and stack on the clipboard as text, ready for an issue or a chat. Reload restarts the app in a fresh runtime and clears the LogBox.
- Arrows page through the entries.

## Opening frames in your editor

The dev server launches the editor, so it works from a simulator, an emulator or a device. Set `KUITO_EDITOR` to choose it (`code`, `cursor`, `zed`, `subl`, `webstorm`, `idea`, `studio`, with flags if you like: `KUITO_EDITOR="code --reuse-window"`); otherwise a graphical `VISUAL` or `EDITOR`, then VS Code. Only files inside the project open.

## In depth

[LogBox](../../../../docs/logbox.md) covers how the kernel, the shell and the dev server produce each entry and map its stack.

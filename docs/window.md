# window

The app's window as signals: its size, the safe area's insets and its
orientation, in points on iOS and dp on Android.

```tsx
import { Text, window } from 'kuito';

<Text>{`${window.size.value.width} × ${window.size.value.height}`}</Text>;
<Text>{window.orientation.value === 'landscape' ? 'Wide' : 'Tall'}</Text>;
window.insets.value; // { top, left, bottom, right }
```

| Signal        | Is                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`        | `{ width, height }`: the same object while the size stays.                                                                                         |
| `insets`      | How far the status bar, the notch, the home indicator and the navigation bar reach in.                                                             |
| `orientation` | `'landscape'` when the window is wider than it is tall, otherwise `'portrait'`.                                                                    |
| `widthClass`  | `'compact'` under 600 wide, `'medium'` under 840, `'expanded'` wider; what `@media (width-class: …)` follows ([conditions](styles.md#conditions)). |

All three are read synchronously. A read in JSX or a `watch` follows them, and
the module emits changes only while something watches one. For padding by the
safe area, `SafeArea` does it natively and needs none of this: use the
signals for layout decisions JavaScript makes, such as a column count.

## How it is wired

The shell reports its window to `KuitoWindowMetrics`, shell state in
`native/ios/App/Shell` and `dev.kuito.runtime.shell`, after every layout,
the one moment the size and the
insets are both current after a rotation, a resize or a change of the bars:

- iOS: the window's `layoutSubviews` and `safeAreaInsetsDidChange`, with
  `bounds` and `safeAreaInsets`.
- Android: a global layout listener on the activity's root view, with its size
  and the root window insets of the system bars and the display cutout.

`KuitoWindowMetrics` keeps the last metrics under a lock (iOS) or in a
volatile field (Android), so the JS thread reads them without waiting for the
main thread, and reports only a change.

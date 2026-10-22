# keepAwake

Keeps the screen on while the component that calls it is mounted. Each call
holds the screen on its own, and the screen may sleep again only when every
hold is released.

```tsx
import { Video, keepAwake, app } from 'kuito';

function Player() {
  keepAwake(); // held while Player is mounted
  return <Video src={{ uri: 'https://example.com/movie.mp4' }} flex={1} />;
}

// For the app's life, outside any component; call the result to let go.
const release = keepAwake({ scope: app });
release();
```

`keepAwake()` is a scope effect (see [native modules](native-modules.md#scope-effects)):
called while a component sets up, it holds the screen from mount until the
component unmounts. Anywhere else it needs `{ scope: app }`, and a call
without it throws. Either way it returns the function that lets the screen
sleep sooner; calling it twice is harmless.

iOS turns off `UIApplication.isIdleTimerDisabled`; Android adds
`FLAG_KEEP_SCREEN_ON` to the activity's window, which only applies while the
app is in front. A reload releases every hold.

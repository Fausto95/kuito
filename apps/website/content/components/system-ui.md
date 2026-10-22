# SystemBars

`SystemBars` declares the system chrome around the app for as long as it is mounted: the status bar, the root view's color, Android's navigation bar, immersive mode and iOS's home indicator. Render it where a screen needs its own bars, or give a route `systemBars`.

Use it for:

- light status bar content over a dark screen;
- a full-screen photo or video with the bars hidden;
- Android's navigation bar colored to match the app.

```tsx
import { SystemBars, Text, VStack } from 'kuito';

export default function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#101014"
        navigationBarButtonStyle="light"
      />
      <VStack flex={1} backgroundColor="#101014">
        <Text color="#ffffff">Photos</Text>
      </VStack>
    </>
  );
}
```

Every mounted SystemBars is an entry in one stack: the last one that sets a prop wins it, each of `statusBar`'s props on its own, and a prop left out sets nothing. Unmounting gives its props back to the entries below, down to the shell's own. Colors are CSS hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or `transparent`; anything else is a `TypeError` when it renders.

## Patterns

### Set the bars per screen

A `Route`'s `systemBars` takes a SystemBars's props and applies them while its screen is focused. Going back restores the screen below.

```tsx
import { Route, Router, Text } from 'kuito';

function Home() {
  return <Text padding={16}>Home</Text>;
}

function Photo() {
  return <Text padding={16}>Photo</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} />
      <Route
        name="photo"
        path="/photo"
        screen={Photo}
        systemBars={{ statusBar: { content: 'light', hidden: true } }}
      />
    </Router>
  );
}
```

Screens below in a stack and other tabs stay mounted, so a SystemBars rendered inside them stays in the stack too: for bars per tab, use the routes' `systemBars`.

### Go full screen

`immersive` hides the status bar and the navigation bar, lets iOS's home indicator fade out, and on iOS lets the first edge swipe reach the app. An entry mounted after it wins over what it hides.

```tsx
import { Button, Show, SystemBars, VStack, Video, signal } from 'kuito';

export default function Player() {
  const fullScreen = signal(false);

  return (
    <VStack flex={1}>
      <Show when={fullScreen.value}>
        <SystemBars immersive />
      </Show>
      <Video src={{ uri: 'https://example.com/film.m3u8' }} flex={1} />
      <Button onPress={() => (fullScreen.value = !fullScreen.value)}>Full screen</Button>
    </VStack>
  );
}
```

### Animate the status bar

`animated` animates changes to `content`, `hidden` and Android's `backgroundColor`; `transition` picks how iOS shows and hides it.

```tsx
import { Button, SystemBars, VStack, signal } from 'kuito';

export default function Reader() {
  const reading = signal(false);

  return (
    <VStack flex={1}>
      <SystemBars statusBar={{ hidden: reading.value, animated: true, transition: 'slide' }} />
      <Button onPress={() => (reading.value = !reading.value)}>Focus</Button>
    </VStack>
  );
}
```

### Lay out under the status bar on Android

`SystemBars.statusBarHeight` is the status bar's height in dp on Android, read synchronously, and null on iOS.

```tsx
import { Box, SystemBars } from 'kuito';

export default function Header() {
  return <Box height={56 + (SystemBars.statusBarHeight ?? 0)} backgroundColor="#5b5bd6" />;
}
```

## Platform differences

A prop naming chrome a platform doesn't have does nothing there, so app code needs no platform checks.

| Prop                                                                    | iOS                                                                     | Android                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `statusBar.content`, `statusBar.hidden`                                 | Yes                                                                     | Yes                                  |
| `statusBar.transition`                                                  | `fade` (default), `slide`, `none`                                       | Its own                              |
| `statusBar.backgroundColor`, `statusBar.translucent`                    | No effect                                                               | Yes                                  |
| `navigationBarColor`, `navigationBarButtonStyle`, `navigationBarHidden` | No effect                                                               | Yes                                  |
| `homeIndicatorAutoHidden`                                               | Yes                                                                     | No effect                            |
| `immersive`                                                             | Hides the status bar, auto-hides the home indicator, defers edge swipes | Hides the status and navigation bars |

`statusBar.content: 'auto'` is the style the app launched with: `statusBar.style` in `kuito.config.ts`, which is dark text in light mode and light text in dark mode unless set.

## Related

- [SafeArea](./safe-area.md)
- [Router](./router.md)
- [Appearance](../../../../docs/appearance.md)
- [SystemBars in depth](../../../../docs/system-ui.md)

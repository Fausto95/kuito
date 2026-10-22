# SystemBars

The system chrome around the app, declared as a component: the status bar,
the root view's color, Android's navigation bar, immersive mode and iOS's home
indicator. Render it for as long as it should hold, or give each route its own.

```tsx
import { Image, Route, Router, SystemBars, Text, type ScreenProps } from 'kuito';

const Home = () => <Text>Home</Text>;
const Photos = () => <Text>Photos</Text>;
const Photo = ({ id }: ScreenProps<{ id: string }>) => (
  <Image src={`https://example.com/photos/${id}.jpg`} flex={1} />
);

export function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#4b2a8a"
        navigationBarButtonStyle="light"
      />
      <Photos />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Route name="home" path="/" screen={Home} />
      <Route
        name="photo"
        path="/photo/:id"
        screen={Photo}
        systemBars={{ statusBar: { content: 'light', hidden: true } }}
      />
    </Router>
  );
}
```

| Prop                       | iOS                                                                     | Android                                                    |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `statusBar`                | the status bar, [below](#the-status-bar)                                | the status bar, [below](#the-status-bar)                   |
| `backgroundColor`          | the root view controller's view                                         | the window's decor view                                    |
| `navigationBarColor`       | no navigation bar: no effect                                            | a view behind the navigation bar, as tall as its inset     |
| `navigationBarButtonStyle` | no effect                                                               | `light` buttons for a dark bar, `dark` for a light one     |
| `navigationBarHidden`      | no effect                                                               | hides the bar; a swipe from the edge shows it for a moment |
| `immersive`                | hides the status bar, auto-hides the home indicator, defers edge swipes | hides the status and navigation bars                       |
| `homeIndicatorAutoHidden`  | the home indicator fades while the screen isn't touched                 | no home indicator: no effect                               |

A prop naming chrome a platform doesn't have does nothing there, so app code
needs no platform checks. Colors are CSS hex (`#rgb`, `#rgba`, `#rrggbb`,
`#rrggbbaa`) or `transparent`; anything else is a `TypeError` when the
component renders.

## The status bar

`statusBar` takes the status bar's own props:

| Prop              | Values                                          | Platforms                |
| ----------------- | ----------------------------------------------- | ------------------------ |
| `content`         | `auto`, `light`, `dark`                         | both                     |
| `hidden`          | boolean                                         | both                     |
| `animated`        | animates `content`, `hidden`, `backgroundColor` | both                     |
| `transition`      | `fade` (default), `slide`, `none`               | iOS; Android has its own |
| `backgroundColor` | a hex color, or `transparent`                   | Android; ignored on iOS  |
| `translucent`     | true (default) or false                         | Android; ignored on iOS  |

`auto` is the style the app launched with: `statusBar.style` in
kuito.config.ts, `auto` unless set, which is dark text in light mode and light
text in dark mode, on both platforms. `SystemBars.statusBarHeight` is the
status bar's height in dp on Android, read synchronously; null on iOS.

## The stack

Every mounted `<SystemBars>` is an entry in one stack. The last entry that
sets a prop wins that prop, each of `statusBar`'s props on its own, and a prop
left out or `undefined` sets nothing. Unmounting an entry gives its props back
to the ones below, with the `animated` of the entry that set them, down to the
shell's own: its root color and launch status bar, a transparent navigation
bar with the theme's buttons, nothing hidden. A `<SystemBars>` whose props
change keeps its place. Changes made together, like a screen's SystemBars
mounting, cross to the platform once, and only what differs from what the
platform shows.

`immersive` is what it hides: the status bar, the navigation bar and the home
indicator, as if the entry set `statusBar.hidden` (animated),
`navigationBarHidden` and `homeIndicatorAutoHidden`. The entry's own props win
over those, and so does any entry mounted after it: a
`<SystemBars statusBar={{ hidden: false }} />` mounted after an immersive one
shows the status bar. On iOS it also defers edge swipes, so the first swipe
reaches the app. `immersive={false}` sets nothing, like a prop left out.

There are no imperative setters: they would bypass the stack, and the
component's scope already says how long a style lasts. The stack outlives a
Live Patch: mounted SystemBars keep their entries when the app's bundle runs
again. A reload gives every bar back to the shell.

## Per screen

A `<Route>`'s `systemBars` takes a `<SystemBars>`'s props and applies them
while its screen is focused: the top sheet, or the top of the selected tab's
stack ([navigation](navigation.md)). The Router moves that entry to the top of
the stack before the focused screen renders, so it wins over SystemBars
mounted before the screen showed, and the screen's own `<SystemBars>` elements
still win over it. Going back restores the screen below.

A `<SystemBars>` rendered inside a screen counts while the screen is mounted:
screens below in a stack and other tabs stay mounted, and their SystemBars
stay in the stack, under the newer ones. For bars per tab, use the routes'
`systemBars` option.

The root view shows where the app's views don't cover it: behind a screen
that doesn't fill the window, or a transition. A navigation stack's screens
are opaque.

## How it is wired

`SystemBars` drives the native `SystemUI` module. On iOS, the state lives in
`KuitoSystemBars`, which the shell's root view controller reads for
`preferredStatusBarStyle`, `prefersStatusBarHidden`,
`preferredStatusBarUpdateAnimation`, `prefersHomeIndicatorAutoHidden` and
`preferredScreenEdgesDeferringSystemGestures` (view-controller-based status
bar appearance); the shell seeds it with kuito.config.ts's launch style. The
stack starts from the launch `hidden`, read synchronously, so giving `hidden`
back restores the configured status bar. That state is the shell's
(`KuitoSystemBars`, in `native/ios/App/Shell`), which the root view
controller reads, so a shell without `SystemUI` keeps the configured bars.

On Android, `WindowInsetsControllerCompat` sets the icons and visibility, and
a swipe from the edge shows hidden bars for a moment. Android 15 draws every
app edge to edge and ignores `Window.statusBarColor` and
`Window.navigationBarColor`, so each bar's color is a view in the decor view
sized to that bar's inset, the same on every version. `statusBar.translucent:
false` pads the content below the status bar instead, so a `SafeArea` there
gets no top inset. With three-button navigation the system draws a scrim of
its own; a navigation bar color other than transparent turns it off.

iOS 13 removed the network activity indicator, so there is no prop for it.

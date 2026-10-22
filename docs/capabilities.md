# Kuito capability plan

Kuito aims for native UI with TypeScript ergonomics, fine-grained reactivity,
and no dependency on React's reconciler. This is an **experimental project**, not
a production replacement for React Native/Expo.

## Implemented in source; native/device verification varies

| Area                                   | Current implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Next gate                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Reactive state, component registration | Kuito JS/Hermes kernel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Dynamic composition, keyed components                              |
| Inherited values                       | `inherited`, `provide` and `inherit`: a component provides a value its descendants read as a signal, with nothing passed between and no re-render; motion values bind on the UI thread ([reactivity](reactivity.md#inherited-values), [placement](placement.md#inherited-values))                                                                                                                                                                                                                               | —                                                                  |
| Primitives                             | Primitives named for what they do ([naming](naming.md)): SafeArea, Sheet, Pressable, cached Image, Scroll (horizontal, scroll events, pull-to-refresh) a List virtualized by UICollectionView and RecyclerView, and a Pager of swiped pages ([reference](primitives.md), [lists](lists.md), [pager](pager.md))                                                                                                                                                                                                                                              | Image                                                              |
| Lifecycle and imperative events        | onMount, watch, effect, refs, capture/bubble, handlers named for the fact they report ([guide](events.md))                                                                                                                                                                                                                                                                                                                                                                                                      | Better event parity, platform testing                              |
| Fragment                               | Flat logical children, no native wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Nested keyed structural tests                                      |
| Structural Live Patch                  | Native kind retype/removal and indexed view moves when supported                                                                                                                                                                                                                                                                                                                                                                                                                                                | Device view identity/focus tests                                   |
| Control flow                           | `Show`, `Switch`/`Match`, keyed `For` and reactive child expressions re-plan only their own branch on signal changes; `Catch` shows a fallback with `retry` for render, effect and resource errors in its subtree; `Loading` shows one until the resources under it settle ([guide](control-flow.md))                                                                                                                                                                                                           | —                                                                  |
| Native view table                      | C++ ViewTable checks each typed host batch whole (docs/native-scheduling.md)                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                  |
| Frame-aware scheduler                  | C++ FIFO scheduler + Choreographer/CADisplayLink batching                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Measured p95 frame latency on real devices                         |
| Native styling                         | Compile-time CSS classes and styles() sharing one property table: box model, borders, shadows, gradients, typography, transforms; tokens that follow the color scheme, `@media` width, width-class and reduced-motion conditions, variants (`.card[data-size=large]`), `@platform` blocks ([reference](styles.md#conditions))                                                                                                                                                                                   | Typed token metadata, slots                                        |
| Animations                             | Animations as data on the UI thread: timing, spring, decay, keyframes, sequence, repeat; `animate`/`transition` props (CSS transitions compile to them); `enter`/`exit` effects (fade, slide, zoom, composed); `layout` frame animation; colors; reduced motion ([guide](motion.md))                                                                                                                                                                                                                            | Shared elements outside stack screens                              |
| Gestures                               | Pan, tap, long press, pinch, rotate, fling and raw touches as values, recognized natively (RNGH ports), composed with race/together/orElse; motion values follow them on the UI thread with no handler; works inside a Sheet ([guide](motion.md#gestures))                                                                                                                                                                                                                                                      | Multi-pointer raw touches                                          |
| Navigation                             | Typed routes from route files (`routes.show({ id })`, a wrong param is a type error), screen results (`present`/`dismiss`), native stacks (UINavigationController; Android stack with predictive back), native tabs, sheet routes, opt-in deep links mapped onto routes, shared elements between stack screens (`sharedId`) ([guide](navigation.md), [linking](linking.md))                                                                                                                                     | Shared elements in sheets and on predictive back                   |
| Native modules                         | Modules declared by a TypeScript spec and linked by id: generated Swift and Kotlin protocols, sync and Promise functions with declared threads, events and live values, arguments checked and crossing as typed values, only the functions an app calls shipped ([guide](native-modules.md)); views from modules ([guide](native-modules.md#views)); haptics, clipboard, Slider, DatePicker, Select, SegmentedControl, ContextMenu, Blur, Drawing (vector shapes); local notifications on both platforms and remote push on iOS ([guide](notifications.md)) | Remote push on Android (no provider chosen yet), cancellable calls |
| CLI / devtools                         | Devtools sheet (⌘D/⌘M, shake, `m`), performance monitor, update highlighting, self-healing dev link ([guide](devtools.md))                                                                                                                                                                                                                                                                                                                                                                                      | Device logs, traces, disconnect handling                           |
| SwiftPM                                | The iOS shell links prebuilt Hermes V1 through a local SwiftPM package; no CocoaPods ([decision](#ios-packaging-decision-swiftpm))                                                                                                                                                                                                                                                                                                                                                                              | None                                                               |
| Async                                  | task, resource, timers, fetch with streamed reads, WebSocket, AbortController ([web APIs](web-apis.md))                                                                                                                                                                                                                                                                                                                                                                                                         | The Streams API                                                    |

## Proposed APIs — NOT IMPLEMENTED

We should preserve familiar ideas from React without copying its rendering
architecture:

| React concept       | Kuito direction                                                          |
| ------------------- | ------------------------------------------------------------------------- |
| Activity            | Suspend/deactivate scopes while retaining state and native view identity  |
| Deferred value      | Scheduler-selected deferred signal commits, not component rerender delays |
| Imperative handle   | Typed capability-limited native handle, stable across compatible refresh  |
| Optimistic updates  | Reversible state transaction with rollback and async action ownership     |
| Sync external store | Pluggable subscription and synchronous snapshot contract                  |
| Transition          | Priority-labeled reactive transactions, cancelable/restartable work       |

These features depend on a frame scheduler with backpressure and a reliable
transaction boundary. We should implement and test those dependencies first,
then grow the public component API. Do not ship no-op compatibility shims.

## Styling: one compiler, two entry points

```tsx
import classes from './screen.css';
import { styles, VStack, Text } from 'kuito';

const sheet = styles({
  card: { padding: 16, backgroundColor: '#17263b', borderRadius: 12 },
});
export function Card() {
  return (
    <VStack class={classes.panel}>
      <Text class={sheet.card}>Hi</Text>
    </VStack>
  );
}
```

```css
@tokens {
  --space: 16dp;
  --accent: #8bc6ff;
}
.panel {
  gap: var(--space);
  background-color: #17263b;
}
```

Both lower to native properties at compile time; there is no runtime CSS
parser and **not** complete browser CSS support. CSS measurements support `px`, `rem`, and `em`; see [CSS units](css-units.md). Variants, theme,
width, motion and platform conditions compile to alternate prop sets
([conditions](styles.md#conditions)). Future Arvia-inspired capabilities:
tokens with typed metadata, slots, and a static analyzable cascade. Compiler diagnostics must reject
ambiguous rules rather than silently dropping declarations.

## Animations and scheduling

Animation work is decoupled from application JS, as Reanimated showed it must
be: a gesture-driven animation cannot wait on the app's JS thread each frame.
Motion values, animated props, effects, gestures and the values following them
run in a second Hermes runtime on the UI thread, as data or placed there by the
compiler ([motion](motion.md)), with Reanimated's interruption semantics for
animations; `layout` runs on the platforms' own frame animators.

## iOS packaging decision: SwiftPM

The iOS shell links Hermes through SwiftPM; there is no CocoaPods. Hermes is
Meta's prebuilt Hermes V1 `hermes-ios` xcframework, pinned in
`native/hermes.json`. Maven Central publishes it as a tarball whose frameworks
carry no headers, and a remote SwiftPM binary target must be a zip, so a remote
package would need a repackaged copy hosted by us and re-published on every
bump. Instead the CLI checks the tarball against its pinned SHA-256 and unpacks
it once into a local package, a `binaryTarget` by path plus the headers
(`src/cli/hermes-ios.ts`), which the generated XcodeGen spec depends on.

## Benchmark policy

See [benchmarks](../benchmarks/README.md). The host-only C++ graph benchmark
is implemented and does not establish an advantage over React Native.
No device-to-device comparison with React Native has been run.

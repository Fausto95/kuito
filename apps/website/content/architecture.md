# Architecture

Kuito is six parts: a compiler, a reactivity model, an on-device runtime, two renderers with one shape, view flattening, and Live Patch. Native modules extend all of it. Each part below links to the page that goes deeper.

<!-- diagram: kuito-architecture.svg -->

## Compiler

TSX and CSS become a JavaScript bundle and native style properties at build time.

- **Oxc** lowers TSX. A JSX expression that reads a signal (`opacity={visible.value ? 1 : 0}`) becomes a closure the runtime subscribes to.
- **Rolldown** bundles the app with its npm dependencies, unmodified.
- **The style compiler** turns `.css` files and `styles()` into numeric native properties, plus small font-relative instructions for `em`. Unsupported CSS fails the build; nothing parses CSS on the device.

Deeper: [Stylesheets](../../../docs/styles.md), [CSS units](../../../docs/css-units.md), [Native renderer](../../../docs/native-renderer.md).

## Reactivity

A signal holds a value. JSX that reads it follows it; a write updates the native properties that read it, and the component function does not run again.

<!-- diagram: kuito-reactivity.svg -->

- `computed` derives, `watch` and `effect` react, `store` makes every path of an object a signal.
- Writes batch themselves: everything one native event writes reaches the screen in one host batch. A write anywhere else (after an `await`, in a timer) opens a batch that ends on the next microtask.
- `Show`, `Switch`, `For` and each reactive child expression own their branch. When a signal a condition read changes, that branch alone is planned again, in a microtask: the rest of the screen is not walked and its subscriptions stay. A failed re-plan commits nothing, and the previous UI remains.
- A component instance is its place, its definition and its `key`.

### Hook identity

A hook's state belongs to its slot, keyed by `<component path>:<kind>:<name>`, never by its position among the calls. A hook assigned to a variable is named after it (`const visits = signal(1)`); one assigned to nothing is named by its ordinal among the hooks of its kind in its component.

So adding a hook, reordering hooks or calling one inside an `if` keeps the state of every hook assigned to a variable across Live Patches. A hook assigned to nothing keeps its state while the hooks of its kind before it stay; renaming a variable renames its slot, which starts over. A slot's state lasts as long as its component instance.

Deeper: [Reactivity](../../../docs/reactivity.md), [Control flow](../../../docs/control-flow.md), [Live Patch](../../../docs/incremental.md).

## Runtime

JavaScript runs in Hermes inside the native process, on one thread of its own. Views live on the UI thread.

<!-- diagram: kuito-threads.svg -->

- Each job (an event, a timer, a network completion) sends at most one batch of typed view mutations: `Create`, `Remove`, `Move`, `Flatten`, `Prop`, `Command`.
- The batch is one `ArrayBuffer`, decoded once in C++. Hermes calls C++ through JSI; there is no serialized bridge.
- The UI thread applies batches in order. Native events queue back to Hermes the same way.
- Animations and gestures can run on the UI thread, next to the views, without a JavaScript callback per frame. The compiler decides which code runs there; the [placement report](./guides/placement.md) shows its decisions.

Deeper: [Threads and the host batch](../../../docs/native-scheduling.md), [On-device Hermes](../../../docs/on-device-hermes.md), [Motion](../../../docs/motion.md).

## Renderer

UIKit on iOS and Android Views on Android implement the same view operations with the same layout.

<!-- diagram: kuito-renderer.svg -->

- The kernel numbers views and commits a plan; a label maps to one native object, kept across compatible patches.
- A view factory maps each kind to a native view. Property tables, one per concern, are keyed by prop name; a parity test holds both platforms to the manifest.
- Each renderer keeps one record per view: its native view, its layout node, its gestures, whether it is exiting.
- A prop lands on both platforms in the same change, or the docs say which one lacks it.

Deeper: [Native renderer](../../../docs/native-renderer.md), [Events](../../../docs/events.md).

## Flattening

A container that only groups and positions its children gets no native view.

<!-- diagram: kuito-flattening.svg -->

- Layout-only: `VStack`, `HStack`, `Box` or `Spacer`, layout props only, no handler, no ref, no animation.
- Its node stays in the layout tree; its children's views join the nearest ancestor with a view.
- The prop's key decides, not its value: `backgroundColor={on.value ? 'red' : null}` keeps its view while the color is off, so toggling never creates and destroys views.
- The kernel decides at commit; the renderers carry it out. No `collapsable` prop.

Deeper: [View flattening](../../../docs/flattening.md).

## Live Patch

A saved file updates the running app. State and native views survive when the edit is compatible.

<!-- diagram: kuito-live-patch.svg -->

- Components carry a stable id and a fingerprint of the syntax they depend on. An edit re-runs the components that read what changed, and only those; a reformat re-runs none.
- Patches are JavaScript source over a local WebSocket, applied by the persistent Hermes runtime. Native code changes need a rebuild.
- A patch that fails to apply is rejected; the previous version stays live and the LogBox says why.

Deeper: [Live Patch](../../../docs/incremental.md), [Devtools](../../../docs/devtools.md), [LogBox](../../../docs/logbox.md).

## Native modules

Platform code an app calls: a Swift class, a Kotlin class and one TypeScript spec that declares both.

<!-- diagram: kuito-native-modules.svg -->

- The compiler reads the spec without running it and keeps a stub per function the app calls; the bundle carries only those.
- Modules are linked by id into the shells the CLI generates. The app commits no native project.
- A module can expose functions, signals the platform updates, and views rendered in JSX, as `Camera`, `Video` and `WebView` do.
- Kuito's own capabilities (`haptics`, `location`, `storage`, …) are modules of this kind.

Deeper: [Native modules](../../../docs/native-modules.md), [App projects](../../../docs/apps.md).

## Decisions

The rules every part respects, and what is still open, are in the [decision record](../../../docs/architecture.md).

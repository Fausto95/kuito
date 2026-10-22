# Native modules

A native module is platform code an app calls: a Swift class on iOS, a Kotlin
class on Android, and a TypeScript spec that declares both and types them for
the app. Kuito's own capabilities are built this way and ship as lower-case
namespaces of functions and signals: `haptics`, `clipboard`,
[`linking`](linking.md), [`network`](network.md), [`share`](share.md),
[`permissions`](permissions.md), [`location`](location.md),
[`persisted` and `db`](storage.md), [`secureStore`](secure-store.md),
[`app`](app-state.md), [`window`](window.md), [`keyboard`](keyboard.md),
[`accessibility`](accessibility.md), [`device`](device.md),
[`localization`](localization.md), [`splash`](splash.md),
[`appearance`](appearance.md), [`keepAwake`](keep-awake.md),
[`brightness`](brightness.md), [`backgroundTasks`](background-tasks.md),
[`notifications`](notifications.md),
[`fileSystem`](file-system.md), [`mediaPicker`](image-picker.md),
[`fonts`](fonts.md), [`image`](primitives.md#image), [`SystemBars`](system-ui.md),
[`alert()` and `prompt()`](alert.md), [`actionSheet()`](action-sheet.md) and [`audio`](audio.md).
A module can also contribute a view an app renders in JSX
([views](#views)), as [`Camera`](camera.md),
[`WebView`](webview.md), [`Video`](video.md), [`DatePicker`](date-picker.md), [`Select`](select.md),
[`SegmentedControl`](segmented-control.md), [`ContextMenu`](context-menu.md), [`Blur`](blur.md) and [`Drawing`](drawing.md) do. A module that needs a
runtime permission asks through `KuitoPermissions` natively; see
[permissions](permissions.md#from-another-module).

```tsx
import { Text, clipboard, haptics } from 'kuito';

console.log(await clipboard.readText());
await clipboard.writeText('https://www.tvmaze.com');
void haptics.selection();

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

Every capability is a namespace of the root entry, one file exporting its
functions one by one, so a bundle keeps only the functions it calls.

## A module's spec

A module is declared once, in TypeScript, and linked by id: the compiler reads
the spec without running it, the bundle keeps a stub for each function the
app calls, and the shell compiles a link table of only those. Nothing is
dispatched by name.

`modules/battery/battery.ts`, the spec, named like its directory:

```ts
import { defineModule, event, fn, live } from 'kuito';

export type Mode = 'saver' | 'normal';
export type Reading = { level: number; charging: boolean; until: number | null };
export type LowBattery = { level: number };

export default defineModule('Battery', {
  read: fn.sync<() => Reading>(),
  setMode: fn.main<(mode: Mode) => Promise<void>>(),
  history: fn.background<(days: number) => Promise<number[]>>(),
  requestAccess: fn.main.callback<() => Promise<boolean>>(),
  charging: live<boolean>(),
  low: event<LowBattery>(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.myapp.modules.battery.BatteryModule' },
});
```

| Declaration             | Runs on                               | JavaScript gets | Natively                             |
| ----------------------- | ------------------------------------- | --------------- | ------------------------------------ |
| `fn.sync`               | the JS thread                         | the value       | returns the value                    |
| `fn.main`               | the main (UI) thread                  | a Promise       | returns the value, `@MainActor`      |
| `fn.background`         | the module's serial background thread | a Promise       | returns the value                    |
| `fn.main.callback`, ... | starts on its thread                  | a Promise       | settles a `KuitoPromise` once, later |

Besides functions, a spec declares what the platform sends:

- **`event<Payload>()`**, an event: `low.addListener(fn)` returns a
  subscription. The platform sends it from the first listener until the last
  is removed: natively `startLow(_ emitter: KuitoEmitter<LowBattery>)` and
  `stopLow()` run on the main thread, and `emitter.send(payload)` may be
  called from any thread in between. `event()` without a type has no payload.
- **`live<T>()`**, platform state an app reads as a signal
  (`battery.charging.value`). Unwatched, each read calls `charging()` on the
  JS thread, so it is never stale; while something watches it,
  `startCharging(_ signal: KuitoSignal<Bool>)` runs on the main thread and
  `signal.set(value)` writes the signal through the kernel. `live`, not
  `signal`: `signal()` makes an app's own.
- **`motion<T>()`**, platform state the UI thread follows, a motion value
  ([motion values](#motion-values)).
- **`view<Props, Methods>({ events, methods })`**, a view the app renders in
  JSX ([views](#views)).

### What a spec may hold

The compiler reads the spec as written (src/dev/modules/spec.ts), so it
holds only imports, types and its default export, `defineModule`, with every
value a literal. A statement that would run is a build error at its line, and
so is anything below that the platforms can't share.

- **The name** is a PascalCase string literal: `Battery` is what Swift and
  Kotlin implement as `BatterySpec`.
- **Parameters and results** are `number`, `string`, `boolean`, `Json`,
  `ArrayBuffer` ([bytes](#bytes)), arrays, `Record<string, T>`, `T | null`, optional parameters and fields, and
  named types. A string union declared with `type` becomes an enum (`Mode`:
  Swift's `.saver`, Kotlin's `Mode.SAVER`), and an object type declared with
  `type` or `interface` a struct or data class. An inline union or object is
  an error that suggests the alias; a generic, `extends`, a function type or a
  type that contains itself is an error too.
- **Member names** are Swift and Kotlin identifiers, each declared once.
  `then` and `default` are reserved, and so are `ios` and `android`, which
  hold the module's [native needs](#native-needs).
- **A view's method** runs on the main thread with the view, so it is
  `fn.main`, and it may not take the name of a member of the view's element
  (`id`, `focus`, `addEventListener`, ...).
- **An import of another spec** is a module this one requires natively
  (`import '../permissions/permissions'`): the shell includes it too.

An app imports the spec's default, the module, and calls its members:
`import Battery from './modules/battery/battery'` and `Battery.read()`. Its
types are the spec's own; the bundle still keeps only the members called.
Kuito's own capabilities re-export theirs from their namespace
(`haptics.impact`, `clipboard.hasText`).

### What the compiler generates

- **One stub per member**, in place of the spec: `const read =
  /* @__PURE__ */ globalThis.__kuito.link(3, "Battery.read", "js", [])`, its
  id, thread and argument schema (src/dev/modules/stubs.ts). Events, live
  values and views have their own (`linkEvent`, `linkLive`, `linkView`). Ids
  number every member of every module the app can call, by module name, then
  declaration order, a view then each of its methods
  (src/dev/modules/catalog.ts). Each stub is pure, so the bundler drops every
  one the app doesn't call; the ids still in the bundle after dead-code
  elimination are the shell's link table (src/dev/modules/plugin.ts).
  Kuito's own code keeps a stub only where the app reaches it: its
  components are registered by the pure call their function is wrapped in
  (`defineComponent`, src/dev/components/emission.ts), so one the app never
  renders, a `Router` or a `SystemBars`, leaves with its modules, and a
  bare app links no function at all (test/compiler-native-modules.test.ts).
  An app's own components are registered by a statement after their module,
  so they stay hoisted declarations an import cycle can read.
- **A Swift protocol and a Kotlin interface per module**, `BatterySpec:
  KuitoLinkedModule`, with the spec's enums and structs (src/cli/link-swift.ts,
  link-kotlin.ts). The class `ios.class` and `android.class` name conforms to
  it; a class that drifted from its spec fails the native build, naming the
  method:

  ```swift
  final class BatteryModule: BatterySpec {
      init(context: KuitoModuleContext) {}
      func read() throws -> Reading { … }
      @MainActor func setMode(_ mode: Mode) throws { … }
      func history(_ days: Double) throws -> [Double] { … }
      @MainActor func requestAccess(_ promise: KuitoPromise<Bool>) { … }
      func charging() throws -> Bool { … }
      @MainActor func startCharging(_ signal: KuitoSignal<Bool>) { … }
      @MainActor func stopCharging() { … }
      @MainActor func startLow(_ emitter: KuitoEmitter<LowBattery>) { … }
      @MainActor func stopLow() { … }
  }
  ```

  ```kotlin
  class BatteryModule(private val context: KuitoModuleContext) : BatterySpec {
      override fun read(): Reading = …
      override fun setMode(mode: Mode) { … }
      override fun history(days: Double): List<Double> = …
      override fun requestAccess(promise: KuitoPromise<Boolean>) { … }
      override fun charging(): Boolean = …
      override fun startCharging(signal: KuitoSignal<Boolean>) { … }
      override fun stopCharging() { … }
      override fun startLow(emitter: KuitoEmitter<LowBattery>) { … }
      override fun stopLow() { … }
  }
  ```

  The Kotlin types are in `dev.kuito.link` (`import dev.kuito.link.BatterySpec`).
  Numbers are `Double`, `Json` is `Any` in Swift and `Any?` in Kotlin,
  `ArrayBuffer` is `Data` in Swift and a direct `java.nio.ByteBuffer` in
  Kotlin, and
  an optional field is a Swift optional or a Kotlin nullable defaulting to
  null.

- **`destroy()`**, which a module's class may implement, runs on the main
  thread when the runtime shuts down (a reload, or the app closing), after
  its observers stop: give back what the module holds outside the runtime,
  as `keepAwake` gives back the idle timer.
- **The link table**, `ios/Generated/KuitoLink.swift` and
  `android/generated/dev/kuito/link/KuitoLink.kt` in `.kuito/`:
  `KuitoLink.function(id)` holds one `KuitoFunction(name, thread:, arity:,
  signature:, run:)` per function id the bundle calls, which decodes the
  arguments into the spec's types, calls the module and encodes its result,
  and `KuitoLink.observer(id)` one entry per event and live value it
  watches. The signature types the values that cross
  ([wire format](#wire-format)).
  A module's instance is made, with `init(context:)`, on its first call. A
  generated file a build no longer writes is deleted.

A Live Patch that calls a function the running shell didn't link, or a spec
change that renumbers them, rebuilds the shell.

### What a release ships

Tree shaking works at the level of functions. The bundle holds a stub only
for each member the app calls; a module none of whose members is called is
not compiled into the shell at all, unless a module the bundle calls
[requires it](#which-modules-a-shell-includes). Of a module that is, release
builds keep only what the link table reaches. On Android, R8 shrinks the app
and `native/android/app/proguard-rules.pro` keeps nothing by name beyond the
JNI entry points, so a function no entry calls is removed. On iOS, a Release
build optimizes the whole module and links with `-dead_strip`: the link table
reaches a module only through its spec's protocol, so the witness of a
requirement no entry calls, and the method behind it, are dropped. Nothing
here is `@objc` or open to subclassing, which would keep them alive. A Debug
build keeps everything.

## Views

A module can contribute a view: a `UIView` on iOS and an Android `View`,
rendered in JSX like any primitive. It takes style and layout props, the
shared flexbox engine positions it, and its events arrive as `on*` props.
Nothing in the renderers changes to add one. `Slider` ships with Kuito and is
built this way.

```tsx
import { HStack, Slider, Text, signal } from 'kuito';

const volume = signal(0.5);

function save(level: number) {
  void fetch('https://example.com/settings/volume', { method: 'PUT', body: String(level) });
}

<HStack gap={12}>
  <Text>Volume</Text>
  <Slider
    flex={1}
    height={40}
    value={volume}
    step={0.05}
    onChangeEnd={(event) => save(event.value)}
  />
</HStack>;
```

### How views work

- **A view is a member of its module's spec.** `view: view<SliderProps>({
  events: ['change', 'changeEnd'] })` declares it, and the app renders the
  module's `view` (`Slider` is `SliderModule.view`). A module has at most one
  view, and may have functions and events beside it.
- **It registers on first render.** Importing the view crosses nothing. When
  the kernel first plans one, it calls the view's own id, and the platform
  registers the kind (`module:Slider`) with the renderer, with the events the
  spec declares.
- **Its props are a table keyed by prop name,** like the renderer's own
  `properties/` tables. The view's props come first, then the shared tables
  (layout, decoration, accessibility, gestures...), so `width`, `margin`,
  `opacity` or `label` work on it unchanged. A prop the view doesn't declare
  and no shared table owns throws `unsupportedProp`, and a value that doesn't
  decode into the declared type `unsupportedValue`
  ([native renderer](native-renderer.md#errors)).
- **Its `on*` props are the events it declares.** `onChangeEnd` listens to
  `changeEnd`. The handler receives the event (`type`, `target`) with the
  payload's fields on it, except `onChange`, which receives the payload's
  `value`, as a TextField's and a Toggle's do. A prop bound to a signal is
  two-way: an event whose payload has a field of the prop's name writes it.
  An `on*` prop for an event the view doesn't declare is an error that lists
  the ones it does. The `gestures` prop still attaches gestures; other event
  props (`onPress`, ...) mean nothing on a module's view unless it declares
  that event. Events travel the [event wire format](events.md#wire-format).
- **Its methods are methods of its ref.** What props can't say (take a
  picture, seek a video, reload a page) a view declares as `methods`. Its
  element, the value its `ref` holds, answers them beside `id` and
  `addEventListener`; each returns a Promise and runs on the main thread with
  that view. A call on a view that is no longer mounted rejects without
  crossing.
- **It is a leaf, sized by its style,** unless it takes children. The layout
  engine can't ask a camera or a web view for a content size, so a module's
  view has no intrinsic size and never shrinks below its style, like a
  control. Give it a `height` (and a `width`, or let `alignItems: stretch`
  and `flex` size it).
- **A view that declares `children: true` lays out children inside it,** as
  a `Box` does: `view<ContextMenuProps>({ events: ['select'], children: true })`,
  with `children?: KuitoNode` among its props. Without a size of its own it
  is as large as they are. Its platform view must hold them: a `UIView` on
  iOS, a `KuitoFlexLayout` on Android, which places them where the engine
  laid them out. A view that doesn't declare it throws when given children.

### Write a view

The example is the `Slider` module, `native/modules/slider/` (in an app,
`modules/<name>/`).

**1. Declare it.** The props are a type of their own, beside the spec:

```ts
// src/native/slider.ts
import type { NativeViewEvent } from 'kuito';

export type SliderEvent = NativeViewEvent<'changeEnd', { value: number }>;

export type SliderProps = {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  fillColor?: string;
  trackColor?: string;
  onChange?: (value: number) => void;
  onChangeEnd?: (event: SliderEvent) => void;
};
```

```ts
// native/modules/slider/slider.ts
import { defineModule, view, type SliderProps } from 'kuito';

export default defineModule('Slider', {
  view: view<SliderProps>({ events: ['change', 'changeEnd'] }),
  ios: { class: 'KuitoSliderModule' },
  android: { class: 'dev.kuito.runtime.modules.slider.KuitoSliderModule' },
});
```

Props are data JSON can hold; `on*` props are handlers. The component
accepts each prop as a value or a signal, beside every view's style, layout
and accessibility props.

A view with methods types them in a second type argument and declares each
in `methods`, as `fn.main`. A ref of the view's handle type calls them
(`native/modules/webview/webview.ts`):

```ts
import { defineModule, fn, view, type WebViewMethods, type WebViewProps } from 'kuito';

export default defineModule('WebView', {
  view: view<WebViewProps, WebViewMethods>({
    events: ['loadStart', 'load', 'loadEnd', 'error', 'navigate', 'message'],
    methods: {
      reload: fn.main<() => Promise<void>>(),
      injectJavaScript: fn.main<(script: string) => Promise<void>>(),
    },
  }),
  ios: { class: 'KuitoWebViewModule' },
  android: { class: 'dev.kuito.runtime.modules.webview.KuitoWebViewModule' },
});
```

```tsx
import { Button, VStack, WebView, ref, type WebViewHandle } from 'kuito';

export function Page() {
  const web = ref<WebViewHandle>();

  return (
    <VStack flex={1}>
      <Button onPress={() => web.current?.reload()}>Reload</Button>
      <WebView ref={web} src="https://example.com" flex={1} />
    </VStack>
  );
}
```

**2. Write the Swift view.** The spec's `view` member is a function that
returns a `KuitoModuleView`: the view's class and its props.

```swift
final class KuitoSliderModule: SliderSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoSliderView.self) { view in
            view.prop("value") { (slider, value: Double?) in slider.chosen = Float(value ?? 0) }
            view.prop("disabled") { (slider, value: Bool?) in slider.isEnabled = !(value ?? false) }
        }
    }
}

final class KuitoSliderView: UISlider, KuitoNativeView {
    private let events: KuitoViewEvents

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)
        addAction(UIAction { [weak self] _ in self?.slid() }, for: .valueChanged)
    }

    private func slid() {
        events.emit("change", SliderValue(value: Double(value)))
    }
}
```

- The view conforms to `KuitoNativeView`: Kuito calls `init(events:)` on the
  main thread for each rendered element.
- A view that shows children itself (a carousel, a pager) also adopts
  `KuitoHost`, and the renderer hands it its children
  ([hosts](native-renderer.md#hosts)).
- A prop's value decodes into any `Decodable`. Make it optional to accept the
  prop's removal, which arrives as null; a non-optional prop rejects it. A
  color decodes as `KuitoHexColor`, CSS hex text, whose `color` is the
  `UIColor`; other text rejects the prop.
- `events.emit` takes no payload, or an `Encodable` that encodes to a JSON
  object. Emitting an event the spec doesn't declare is a programming error
  and traps. Mark an optional payload property `@KuitoNullable` to send
  `null` rather than leave it out, as a payload typed `T | null` expects.
- Each method is a requirement of the protocol, called on the main thread
  with the mounted view first; cast it to the view's class
  (`native/modules/webview/ios/KuitoWebViewModule.swift`):

  ```swift
  @MainActor func reload(_ view: UIView) throws {
      guard let web = view as? KuitoWebView else {
          throw KuitoModuleError(KuitoErrorCode.viewNotFound, "The view is not a WebView")
      }
      web.reload()
  }
  ```

**3. Write the Kotlin view.**

```kotlin
class KuitoSliderModule(context: KuitoModuleContext) : SliderSpec {
    override fun view(): KuitoModuleView<*> =
        KuitoModuleView(::KuitoSliderView) { view ->
            view.prop("value", KuitoType.optional(KuitoType.double)) { slider, value -> slider.value = value ?: 0.0 }
            view.prop("disabled", KuitoType.optional(KuitoType.boolean)) { slider, value -> slider.isEnabled = value != true }
        }
}

class KuitoSliderView(context: Context, private val events: KuitoViewEvents) : SeekBar(context) {
    // events.emit("change", mapOf("value" to value)) from a listener
}
```

- Emit a change only for the user's input. Android listeners also fire when
  a prop setter changes the view (`SeekBar.setProgress`, `setChecked`,
  `setText`): check `fromUser`, or detach the listener around the set, so
  the app's own write is not echoed back as an event.

- `KuitoModuleView` takes the view's constructor, `(Context,
  KuitoViewEvents)`, which runs on the UI thread for each rendered element.
- Each prop names its `KuitoType` (`string`, `boolean`, `int`, `double`,
  `obj`, `array`, `list(…)`, `optional(…)`, `enum(…)`, and `color`, CSS hex
  text as an Android color int); a value of the wrong type throws
  `unsupportedValue`. Use `KuitoType.optional` to accept removal.
- `events.emit(event, payload)` takes a `Map` of JSON data, or no payload.
- Each method overrides the interface's, on the UI thread with the mounted
  view first: `override fun reload(view: android.view.View) = web(view).reload()`.

**4. Release what a view holds.** A view that holds something outside itself
(a player, a camera session) gives it back in `unmount`. Kuito calls it on
the main thread when it removes the view, and for every module view when the
runtime reloads. The view may stay on screen a moment longer for an exit
animation, and is not reused after.

```swift
final class KuitoPlayerView: UIView, KuitoNativeView {
    func unmount() { player.release() }
}
```

```kotlin
class KuitoPlayerView(context: Context, events: KuitoViewEvents) : FrameLayout(context), KuitoNativeView {
    override fun unmount() = player.release()
}
```

On iOS `unmount` is part of `KuitoNativeView` and does nothing unless the
view implements it; on Android a view implements `KuitoNativeView` only to
hear it. Leaving the window is not unmounting: a view under a pushed screen,
or behind a fullscreen presentation, is still mounted.

**5. Test the JavaScript side.** `test/native-views.test.ts` renders a
module's view against a fake platform, then checks the props the host
receives and dispatches events back.

### A view on the wire

A module's view crosses the host boundary as the kind `module:<Name>`
(`module:Slider`), apart from the built-in kinds. Its own id registers the
kind: the link table hands `KuitoModuleViews` the `KuitoModuleView` with the
spec's events. A method is a linked main-thread function whose first argument
is the view's number: the platform finds the mounted view in
`KuitoModuleViews`, which holds each module view from its creation until the
renderer removes it, and fails with `ERR_VIEW_NOT_FOUND` when it is gone.
A prop the view declares crosses by its name, even where a built-in kind has
a prop of that name and type of its own (a TextField's `type`); the props
every view takes (style, layout, accessibility) cross by their keys.
Strings, numbers and booleans cross as themselves. The kernel writes an
object or array as plain data, as it does any view's
([structured props](native-scheduling.md#structured-props)), but the
manifest holds no schema for a module's own props, so C++ hands it to the
platform as JSON text (`native/shared/Wire.h`, `typeValue`). The platform
decodes each into the type the prop declares. Each renderer reaches module
kinds through one seam:
`KuitoViewFactory` makes built-in kinds from its table and module kinds from
`KuitoModuleViews`, and a view's own props live on its `KuitoViewStyle`,
ahead of `KuitoProperties`.

## Calls from UI-thread code

App code never names a thread ([placement](placement.md)): a gesture or scroll
handler the compiler places on the UI thread calls a module like any other
code. A `fn.main` function that returns its result (not a `callback` one)
runs there directly, through `__kuitoUIHostCall`: the UI thread is the main
thread, so the platform calls the module at once, with no hop to the JS
thread and back, and the call answers with a Promise as it does on the JS
thread. `haptics.impact('light')` in a scroll handler plays in the frame that
crossed the threshold (`test/motion-app.test.ts`). A handler that only calls
such functions runs on the UI thread too, as one that moves a motion value
does: `onPress={() => haptics.selection()}` buzzes with nothing for the JS
thread. Any other function UI-thread code calls is sent to the JS thread
without waiting, and using its result on the UI thread is an error that names
the function.

### Motion values

`fix: motion<Fix>()` declares a motion value the platform writes, null until
it does. The first time the app reads or binds it, the kernel tells the UI
thread of it and observes it: natively `startFix(_ motion: KuitoMotion<Fix?>)`
runs on the main thread (`fun startFix(motion: KuitoMotion<Fix?>)` on
Android), and each `motion.set(value)` until `stopFix()` is applied by the UI
runtime at once, on the main thread (`UIRuntime::platform`), so a view bound
to it moves in the frame the change arrives, with no JavaScript. The same
value then goes to the JS thread, which moves its own copy without sending it
back, so code that reads it there (an `effect`, a condition) follows it too.
Only the platform writes it: assigning one, or making it follow another
source, is an error; follow it or map it instead. A motion value is for a
source that changes every frame; a value that changes about once a second,
as a location fix does, is an `event` the module's API keeps in a signal
(`location.position`).

## Values, signals and actions

A capability's members follow one rule, so a reader guesses each from its
name:

- **An action is a verb**: `haptics.impact('light')`, `linking.open(url)`,
  `app.openSettings()`. One that waits for the platform returns a Promise.
  There is no `Async` suffix.
- **A fixed fact is a property**: `device.model`, `haptics.supported`,
  `fileSystem.documents`. It is read once, when the app starts; an app that
  reads none of a capability's facts never asks.
- **A value that changes is a signal**: `appearance.colorScheme`,
  `network.state`, `app.state`, `clipboard.hasText`. Read `.value`
  synchronously. A component follows it the way it follows its own state: a
  read in JSX, or `watch(appearance.colorScheme, fn)`. There are no getters,
  setters or listeners to pair with it, and `watch` is the only way to follow
  one.
- **A writable signal** (`brightness.level`, `splash.variant`) takes an
  assignment. It shows the new value at once, and a write the platform
  rejects goes through the error seam.
- **An event is `watch(event, fn)`** on the namespace when it is not a value:
  `app.watch('memoryWarning', fn)`.

### Observed only while watched

A system-state signal starts observing the platform when the first component
subscribes to it and stops when the last one unsubscribes: the native module
event behind it is started and stopped with it. Unwatched, a read asks the
platform synchronously, so it is never stale. Starting to observe reports the
state the platform starts from, which catches a change made in between. A
binding that re-tracks its reads keeps the platform observed through it.

The kernel's primitive is `__kuito.createSource(read, observe)`
(`src/runtime/signals.ts`); `source()` in `src/native/scope.ts` wraps it so a
module's signals cost nothing until first read.

### Scope effects

A resource that should not outlive its user (`keepAwake()`, an audio player)
is owned by the component that makes it:

```tsx
import { Text, app, keepAwake } from 'kuito';

function Reader() {
  keepAwake(); // held from mount until Reader unmounts
  return <Text>A long article</Text>;
}

const release = keepAwake({ scope: app }); // the app's, for its life
```

Called while a component sets up, the resource is made once for that call
(a re-render or a Live Patch keeps it), started when the component mounts, and
released when the component unmounts or the call goes. Anywhere else the call
needs `{ scope: app }`: the compiler reports one at its file and line
(`src/dev/scope-effects.ts`), at module scope, in a helper or in a handler,
and the kernel throws for any it could not see, naming the fix. A view's state
ref (`videoRef()`, `cameraRef()`, `webViewRef()`) has no app scope: like
`ref()`, only a component can own it. Nothing is
`use*`, and nothing needs a manual `release()`.

The kernel's primitive is `__kuito.own(label, create, start)`
(`src/runtime/api.ts`): a hook slot holds what `create` made, and the mount
record `start` returns releases it.

## How it works

- **Each function says where it runs.** A `fn.sync` function runs on the JS
  thread and returns its value directly; `fn.main` and `fn.background` run on
  the main thread or on the module's own serial background thread, in call
  order, and JavaScript gets a Promise. Nothing is bridged by default.
- **Modules load on first call.** Importing a module crosses nothing. The
  platform makes the module's instance the first time one of its functions
  runs or one of its events or live values is observed, so start-up never
  pays for a module the app doesn't call yet.
- **Arguments are checked before they cross.** The kernel checks each
  argument against the function's schema (src/runtime/link.ts) and fails
  with `ERR_ARGUMENT`, naming the function, the argument and the field: a
  function, `NaN`, a `Date` or a class instance never reaches the host. The
  platform decodes what crosses into the spec's types, so a mismatch there
  fails with the same code instead of being cast.
- **A shell has only what the app calls.** The CLI finds Kuito's built-ins
  and the app's own `modules/`, includes the modules the bundle calls, and
  generates the link table. Nobody edits a registry, the renderer or the
  shell. See [which modules a shell includes](#which-modules-a-shell-includes).

`KuitoThread`, the one thread enum (`js`, `main`, `background`), is
generated with the rest of the host's contract from `src/protocol/modules.ts`.

An asynchronous call starts after the JS task that made it ends, so the view
changes that task made reach the main thread first: a main-thread function
sees them queued for the next frame, as `splash.hide` relies on
([splash screen](splash.md#until-the-app-is-ready)).

Keep synchronous functions fast and thread-safe. They block JavaScript while
they run, and they must not touch UIKit or Android Views. Use them for cheap
reads like `clipboard.hasText` or `haptics.supported`.

## Write your own module

An app's modules live in its `modules/` folder, beside `app/`, and never in
Kuito's own files. Make one with the CLI:

```bash
kuito module create Battery
```

```text
modules/battery/
  battery.ts                the spec
  ios/BatteryModule.swift
  android/BatteryModule.kt
```

The directory is the name in kebab case (`BatteryLevel` in
`modules/battery-level/battery-level.ts`), and the spec is named like it: a
directory under `modules/` without its spec fails the build. The scaffold is a
working module with a synchronous function, a main-thread one and an event.
Import it from the app and run `kuito dev`. The rest of this section turns it
into a `Battery` module with a live value and a main-thread read.

### 1. Declare the spec

`modules/battery/battery.ts`:

```ts
import { defineModule, fn, live } from 'kuito';

export type Reading = { level: number; charging: boolean };

export default defineModule('Battery', {
  /** Low Power Mode on iOS, Battery Saver on Android. */
  lowPower: live<boolean>(),
  /** The charge from 0 to 1, or -1 when unknown. */
  read: fn.main<() => Promise<Reading>>(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.myapp.modules.battery.BatteryModule' },
});
```

### 2. Write the Swift module

`modules/battery/ios/BatteryModule.swift`:

```swift
import UIKit

final class BatteryModule: BatterySpec {
    private var observer: NSObjectProtocol?

    init(context: KuitoModuleContext) {}

    // ProcessInfo is thread-safe, so the read runs on the JS thread.
    func lowPower() -> Bool {
        ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    @MainActor func read() -> Reading {
        let device = UIDevice.current

        device.isBatteryMonitoringEnabled = true

        return Reading(level: Double(device.batteryLevel), charging: device.batteryState == .charging)
    }

    @MainActor func startLowPower(_ signal: KuitoSignal<Bool>) {
        observer = NotificationCenter.default.addObserver(
            forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main
        ) { _ in signal.set(ProcessInfo.processInfo.isLowPowerModeEnabled) }
    }

    @MainActor func stopLowPower() {
        observer.map(NotificationCenter.default.removeObserver)
        observer = nil
    }
}
```

- The class is `final` and conforms to the generated `BatterySpec`; the build
  fails, naming the requirement, until it implements every member. The
  spec's types (`Reading`) are generated beside it.
- Throw `KuitoModuleError("ERR_BUSY", "…")` to fail with your own code. Any
  other error arrives as `ERR_NATIVE` with its description.
- For a callback API (a permission prompt, a camera capture), declare the
  function `fn.main.callback` and settle the `KuitoPromise` once, from any
  thread, with `resolve(value)` or `reject(code, message)`:

  ```swift
  @MainActor func requestAccess(_ promise: KuitoPromise<Bool>) {
      AVCaptureDevice.requestAccess(for: .video) { granted in promise.resolve(granted) }
  }
  ```

- `start<Name>` and `stop<Name>` run on the main thread: `start` when the
  first listener or watcher arrives, `stop` when the last one leaves or the
  runtime shuts down. The emitter or signal may be used from any thread in
  between.
- State the app's lifecycle owns comes from the shell through a shared
  object the module observes, as `KuitoLinks` for incoming links and
  `KuitoAppLifecycle` for the foreground state
  ([AppState](app-state.md#how-it-is-wired)). That state is the shell's, so
  it is there whether the module is or not, and the module reads it from its
  first call. Work iOS allows only at launch goes in a
  [launch](#launch). An adapter for a hosted crash service adds itself to
  `KuitoCrashReports` the same way
  ([crash reports](crash-reports.md#adapters)).
- The files in `ios/` compile into the app's target, beside Kuito's own and
  the generated link table, so the module API needs no import.

### 3. Write the Kotlin module

`modules/battery/android/BatteryModule.kt`, in a package under the app's
`applicationId` (`kuito module create` picks it):

```kotlin
package com.example.myapp.modules.battery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager
import dev.kuito.link.BatterySpec
import dev.kuito.link.Reading
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext

class BatteryModule(context: KuitoModuleContext) : BatterySpec {
    private val app = context.applicationContext
    private val power = app.getSystemService(PowerManager::class.java)
    private var receiver: BroadcastReceiver? = null

    override fun lowPower() = power.isPowerSaveMode

    override fun read(): Reading {
        val battery = app.getSystemService(BatteryManager::class.java)

        return Reading(
            level = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) / 100.0,
            charging = battery.isCharging,
        )
    }

    override fun startLowPower(signal: KuitoSignal<Boolean>) {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) = signal.set(power.isPowerSaveMode)
        }.also { app.registerReceiver(it, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)) }
    }

    override fun stopLowPower() {
        receiver?.let(app::unregisterReceiver)
        receiver = null
    }
}
```

- The class takes the `KuitoModuleContext` and implements the generated
  `BatterySpec`; the spec's types are in `dev.kuito.link`, and the runtime's
  (`KuitoPromise`, `KuitoEmitter`, `KuitoSignal`, `KuitoModuleView`) in
  `dev.kuito.runtime.link`.
- `KuitoModuleError("ERR_BUSY", "…")`, `fn.main.callback`, `destroy()` and
  the `start` and `stop` threading work the same as on iOS.
- `context.activity` is the host activity. A
  [background task](background-tasks.md)'s runtime has none, and reading it
  there fails with `ERR_NO_ACTIVITY`: use `context.applicationContext` for
  anything that needs only a `Context` (system services, files, databases).
- To start another activity for its result (a system picker, the camera),
  call `KuitoActivityResults.launch(context.activity, contract, input) { output -> … }`
  on the main thread, with any `ActivityResultContract`. It registers a
  one-shot callback with the activity's result registry, so no module
  overrides `onActivityResult`. Permissions prompts go through it too.

Leave out a platform's section of the spec, and its folder, for a module that
ships on one platform only; a function called on the other fails with
`ERR_FUNCTION_NOT_FOUND`. Say which platform lacks it in the module's docs.

### 4. Use it

```tsx partial
import { Text } from 'kuito';
import Battery from './modules/battery/battery';

const reading = await Battery.read();

<Text>{Battery.lowPower.value ? 'Low Power Mode' : `${Math.round(reading.level * 100)}%`}</Text>;
```

`kuito dev` builds the module into the app's shell. While it runs, saving a
`.swift`, `.kt` or `.ts` file under `modules/` rebuilds the shell
(incrementally: Xcode and Gradle recompile what changed) and relaunches the
app. A Live Patch that calls a function the running shell didn't link, such
as a first `Battery.read()`, rebuilds the shell too; any other TypeScript
change stays a Live Patch.

### 5. Test the JavaScript side

The kernel's half runs in Node. `test/support/fake-modules.ts` answers the
link table's host functions with a fake platform, so app logic built on a
module is tested without a device: `fakeModules({ Camera: { functions: {
takePicture: { thread: 'main', run: () => picture } } } })`, its `host`
spread into `installKernel`'s, and `attach(kernel)` once the kernel is
installed (`test/camera.test.ts`). It numbers Kuito's built-in specs as the
compiler does. `test/module-calls.test.ts` shows the kernel's side of a call
by id.

### Ship a module in a package

A module another app can install is an npm package with the module laid out
as an app's `modules/` is, and one key in its `package.json` naming that
directory:

```json
{ "name": "kuito-battery", "version": "1.0.0", "kuito": { "modules": "modules" } }
```

```text
kuito-battery/
  package.json
  modules/battery/
    battery.ts                the spec
    ios/BatteryModule.swift
    android/BatteryModule.kt
```

The CLI reads the key of each package in the app's own `dependencies`, and
catalogs its specs beside Kuito's and the app's
(`loadCatalog`, src/dev/modules/catalog.ts). The spec is the manifest: there
is no JSON file, config plugin or linking step to keep in step with it. The
app imports the spec, or a namespace the package exports, as it imports its
own: `import Battery from 'kuito-battery/modules/battery/battery'`. The same
rules hold across packages: a module the bundle calls is in the shell and one
it doesn't call is not, and two modules of one name, or two specs that
declare one type name, fail the build naming both files. A key that names no
directory inside the package is an error naming the package's
`package.json`, and so is a packaged spec the app imports while its
`dependencies` don't list the package. A packaged spec requires another
package's by its package name (`import 'kuito-permissions/modules/permissions/permissions'`).

The package's specs and native sources are compiled with the app; its other
files are bundled as any package's are, without Kuito's component and
UI-thread passes, which run on the app's own code. Keep the package's
TypeScript to the spec and plain functions over it.

## Which modules a shell includes

An app pays only for the modules it uses: one that never renders a `Video`
never ships its Swift, its Kotlin or its native dependencies. The CLI decides
when it builds the shell (`shellModules`, src/cli/modules.ts):

- **The bundle names what it calls.** Every stub left in the app's bundle
  after tree shaking names a module. Importing `haptics` from `kuito` and
  calling `haptics.impact` keeps that one stub, and drops `clipboard`'s.
- **The shell includes those modules and what they require, nothing else.**
  A module requires the specs its own spec imports: `Camera` imports
  `Permissions`. The shell names no module: what only it sees (links, the
  foreground state, traits, the window's size and safe area, the bars, push
  token answers) it keeps as its own state, in `native/ios/App/Shell` and
  `dev.kuito.runtime.shell`, which the modules read and observe, and it
  keeps the launch screen up until the first frame with content
  ([splash](splash.md#until-the-app-is-ready)) whether `Splash` is in the
  shell or not. A config whose native settings name a module's class puts
  that module in the shell too: declared background tasks bring
  `BackgroundTasks`, whose job service runs them, and `locationAlways`
  brings `Location`, whose foreground service it declares.
- **App modules follow the same rule.** A module in `modules/` that nothing
  calls isn't compiled. Two modules of one name, or two specs that declare a
  type of one name, fail the build naming both files.

Built-in and app modules go through this one path. Kuito's built-ins live in
`native/modules/<name>/` (kebab case, `native/modules/app-state`), laid out
like an app's.

| Generated (in `.kuito/`)                                                   | From                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ios/Generated/KuitoLink.swift`                                            | the included modules' specs, and the ids the bundle calls                    |
| `ios/project.json`: sources, `packages`, frameworks, Info.plist            | the included modules' `ios`                                                  |
| `android/generated/dev/kuito/link/KuitoLink.kt`                            | the included modules' specs, and the ids the bundle calls                    |
| `android/AndroidManifest.xml`, merged into the framework's                 | the included modules' `permissions`, `providers`, `services` and `receivers` |
| Gradle's `-Pkuito.sources`, `-Pkuito.dependencies` and `-Pkuito.moduleRes` | the included modules' `android`                                              |

Unchanged generated files are left alone, so a rebuild stays incremental, and
a generated file no module produces any more is deleted.

### Native needs

A spec's `ios` and `android` say what the module needs beside its
functions. The CLI validates them before it builds, and errors name the spec
and the key; every key not below is an error, so a typo doesn't pass
silently.

```ts
import { defineModule, fn } from 'kuito';

export default defineModule('Camera', {
  scan: fn.main<() => Promise<string | null>>(),
  ios: {
    class: 'CameraModule',
    swiftPackages: [
      { url: 'https://github.com/example/Lens.git', from: '2.1.0', products: ['Lens'] },
    ],
    infoPlist: { NSCameraUsageDescription: 'Scan codes to join a list' },
  },
  android: {
    class: 'com.example.myapp.modules.camera.CameraModule',
    dependencies: ['androidx.camera:camera-camera2:1.4.1'],
    permissions: ['android.permission.CAMERA'],
    features: [{ name: 'android.hardware.camera.any', required: false }],
    providers: [
      {
        name: 'com.example.myapp.modules.camera.CaptureProvider',
        authorities: '${applicationId}.camera',
        exported: 'false',
        grantUriPermissions: 'true',
        resources: { 'android.support.FILE_PROVIDER_PATHS': '@xml/camera_paths' },
      },
    ],
  },
});
```

| Key                    | Meaning                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ios.class`            | The `final` Swift class conforming to the generated `<Name>Spec`, in `ios/`.                                                                                                                                                          |
| `ios.launch`           | `true`: the class's `@MainActor static func launch()` runs as the app finishes launching ([launch](#launch)).                                                                                                                         |
| `ios.frameworks`       | System frameworks the app target links, like `CoreHaptics`.                                                                                                                                                                           |
| `ios.swiftPackages`    | Swift packages: `url`, `from` (minimum version) and the `products` the app target links. iOS shells have no CocoaPods.                                                                                                                |
| `ios.infoPlist`        | Info.plist keys, such as usage descriptions. Two modules may not set one key differently, and neither may the app's `ios.infoPlist` ([native settings](apps.md#native-settings)); the app's `permissions` reasons replace a module's. |
| `android.class`        | The fully qualified Kotlin class implementing the generated `<Name>Spec`, in `android/`.                                                                                                                                              |
| `android.launch`       | `true`: the class's companion `fun launch(application: Application)` runs as the app's process starts ([launch](#launch)).                                                                                                            |
| `android.dependencies` | Gradle coordinates, `group:artifact:version`, added as `implementation`.                                                                                                                                                              |
| `android.permissions`  | `uses-permission` entries merged into the app's manifest.                                                                                                                                                                             |
| `android.features`     | `uses-feature` entries: `name`, and `required` (true unless it says `false`). Google Play hides an app from devices that lack a required feature, so a module whose app works without the hardware says `false`.                      |
| `android.providers`    | `<provider>`s under `<application>`: attributes without `android:` (`name` and `authorities` required; `${applicationId}` works), and `resources`, `<meta-data>` that names a resource the module ships in `android/res/`.            |
| `android.services`     | `<service>`s under `<application>`: attributes without `android:`, `name` required, such as a foreground service's `foregroundServiceType`.                                                                                           |
| `android.receivers`    | `<receiver>`s under `<application>`: attributes without `android:`, `name` required, and `actions`, the broadcasts its intent filter takes (`android.intent.action.BOOT_COMPLETED`). An alarm's receiver needs no action.             |

A module's `android/res/` directory, when it has one, joins the shell's
resources, so a provider's meta-data can name an XML file there. Prefix
resource names with the module's (`kuito_image_picker_paths`): every
included module's resources share one namespace.

A spec must declare `ios` or `android`. A section without its folder of
sources (`ios/` with `.swift` files, `android/` with `.kt`), or sources
without their section, is an error too.

### Launch

Some work iOS and Android take only while the app launches: BGTaskScheduler
takes its handlers before launch ends, and iOS delivers the notification tap
that launched the app only to a delegate set by then. A module asks for it
with `launch: true` in its `ios` or `android` section, and its class
implements it; a class without one fails the native build at the
generated call (`KuitoLink.launch()`).

```swift
final class TasksModule: TasksSpec {
    @MainActor static func launch() { Tasks.shared.registerHandlers() }
}
```

```kotlin
class TasksModule(context: KuitoModuleContext) : TasksSpec {
    companion object {
        fun launch(application: Application) { Tasks.register(application) }
    }
}
```

The generated link table calls the included modules' launches
(`KuitoLink.launch()`), from the app delegate's
`didFinishLaunchingWithOptions` and the `Application`'s `onCreate`, before
any runtime starts, in the modules' name order. On iOS,
`KuitoLaunchOptions.current` holds why the app launched: Location's launch
starts the headless runtime for a location event. A module not in the shell
launches nothing. Keep a launch short: it delays the app's first frame.

### Add a built-in module

A module that ships with Kuito is the same three parts, in
`native/modules/<name>/`: the spec `<name>.ts`, which imports `defineModule`
from `src/native/define-module.ts`, and `ios/` and `android/`, with Kotlin in
`dev.kuito.runtime.modules.<name>`. The app API is a namespace in
`src/native/<name>.ts` that re-exports the spec's members one by one,
exported from `src/native/index.ts`, so an app that calls none of them drops
the module. Shell code never names a module's classes: what the shell sees
goes into its own state (`native/ios/App/Shell`, `dev.kuito.runtime.shell`)
for the module to read.

## Errors

<!-- error codes: generated from src/protocol/modules.ts -->

| Code                     | Meaning                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `ERR_FUNCTION_NOT_FOUND` | The shell's link table doesn't hold the function: rebuild it.                        |
| `ERR_VIEW_NOT_FOUND`     | A view function's view is not mounted.                                               |
| `ERR_ARGUMENT`           | An argument didn't decode into the declared type.                                    |
| `ERR_ENCODE`             | A result or event payload isn't plain data of the declared type.                     |
| `ERR_NATIVE`             | The function threw something other than `KuitoModuleError`.                          |
| `ERR_THREAD`             | A synchronous call reached an asynchronous function.                                 |
| `ERR_NO_ACTIVITY`        | The module needs the activity, and a background task runs without one. Android only. |

<!-- end of generated error codes -->

A synchronous function throws its error at the call. An asynchronous one
rejects. Arguments that don't match the spec fail in the kernel, before
anything crosses, with the host's `ERR_ARGUMENT`. Either way the error is a
`NativeModuleError` with `code`, and its
message names the module and function (`Clipboard.writeText failed: …`): the
native module's own names, which the namespace wraps. An event listener that
throws is reported to the LogBox, and the other listeners still run.

## Wire format

A module function crosses the host boundary by its id, from
`src/runtime/link.ts` through `native/shared/KuitoRuntime.cpp` to each
platform's linker (`KuitoLinker`) and its generated `KuitoLink`:

| Host function                             | Returns                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `__kuitoHostCall(id, ...args)`            | the result of a `js` function; a failure throws `__kuitoLinkError(id, code, message)`                          |
| `__kuitoHostCallAsync(id, call, ...args)` | nothing; the host later calls `__kuitoLinkSettle(call, value)` or `__kuitoLinkFail(call, code, message)`       |
| `__kuitoHostObserve(id, observing)`       | nothing; while observing, the host calls `__kuitoLinkEmit(id, value)` for an event or a live value             |
| `__kuitoUIHostCall(id, ...args)`          | on the UI thread, the result of a `main` function, run at once ([UI-thread calls](#calls-from-ui-thread-code)) |

Values cross typed by the member's signature, which its generated entry
holds (`KuitoFunction(..., signature:)`, src/cli/link-signature.ts): the
C++ (native/shared/Link.h, LinkJSI.h) reads each argument from JSI as the
spec declares it and builds each result the same way, with no JSON at any
depth. Null, booleans, numbers and strings cross as themselves,
ArrayBuffers as their bytes ([bytes](#bytes)), arrays as lists, `Record` and `Json` objects as string-keyed entries, and a spec's
struct as its fields in declared order: its names never cross, and the C++
reads only the fields the spec declares. Swift gets NSArray and NSDictionary,
Kotlin `Array<Any?>` and `KuitoEntries`, which the generated types decode
(`value.field(0, "mode")`) and encode (`kuitoFields()`); `kuitoEncoded()`
stays the struct as JSON data, for a module that keeps or sends it as
`Json`. A value that doesn't match the signature fails the call with
`ERR_ARGUMENT` (an argument) or `ERR_ENCODE` (a result). A failure is the one
answer with a code and a message. A host without these
functions (the tests' `node:vm` host) has no native modules, so a module fails
on first use there with a message that says so.

### Bytes

An `ArrayBuffer` in a spec crosses as bytes, never as text. One the platform
answers with is shared, not copied: JavaScript's ArrayBuffer holds the
`Data` (Swift) or writable direct `ByteBuffer` (Kotlin, from its position to
its limit) the module returned, until the garbage collector frees it. A heap
or read-only `ByteBuffer` (a mapped file's) and mutable `NSData` are copied
once. JavaScript may write to it, so a module answers with bytes it no
longer uses itself, and never with memory-mapped `Data`, which is
read-only. One JavaScript made is copied once, since Hermes keeps it in its
garbage-collected heap: on iOS into C++ memory the `Data` wraps with no
further copy, on Android into a direct `ByteBuffer`. One the platform made
crosses back to it as the same bytes, each call with its own position and
limit, so a module that reads an argument with `get` moves no one else's.
Those bytes are shared, and the module reads them on its own thread:
JavaScript should not write a buffer a call still holds.

## The module API is versioned

Native modules are Kuito's stable public contract: **module API 1**. An app's
modules, and later third-party module packages, depend on it, so it changes
only in ways that keep existing modules compiling and behaving the same. The
contract is:

- the spec: `defineModule`, `fn.sync`, `fn.main`, `fn.background` and their
  `.callback`, `event`, `live` and `view`, the types a spec may use and its
  [native needs](#native-needs);
- the generated `<Name>Spec` protocol and interface, and how each member maps
  onto it;
- `KuitoLinkedModule` (`init(context:)`, `destroy()`), `KuitoModuleContext`,
  `KuitoModuleError`, `KuitoPromise`, `KuitoEmitter`, `KuitoSignal`,
  `KuitoModuleView` with `KuitoNativeView` and `KuitoViewEvents`, and
  Kotlin's `KuitoType` and `KuitoActivityResults`;
- the error codes above (`KuitoErrorCode` in Swift and Kotlin).

Within version 1, changes only add: a new declaration, a new native need, a
new error code. A change that would break a module ships as API 2, listed
here with what to change. Everything else, the host functions in
[wire format](#wire-format) and the link table's ids included, is internal and
may change in any release.

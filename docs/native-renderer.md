# Native renderer

How the kernel's view operations become UIKit and Android views.

## Shape

- App TSX compiles through Rolldown's Oxc JSX lowering (classic `__kuitoJSX` runtime).
- Computed native properties are JSX expressions that read signals (e.g. `opacity={visible.value ? 1 : 0}`), which the compiler turns into closures. The kernel tracks signals read by the closure and subscribes to them, performing property-level updates **without re-running the component function**. Structural conditions (`Show`, `Switch`/`Match`, reactive child expressions) re-plan the module when their signals change; see [control flow](control-flow.md).
- A view's label maps to one native object: its `id` prop, or `__kuito:<module>:<path>` generated from its place, component and key ([incremental refresh](incremental.md)). Inside the kernel each label has a number (`src/runtime/view-ids.ts`) from the plan that first names it until the view is removed; `plan.ts`, `reconcile.ts` and `commit.ts` work with numbers, and `host.ts` turns them back into labels at the host boundary. Compatible patches update property values and handlers while retaining the object and signal. Removed views are disposed. A view whose kind or parent changes is removed and created again, with its subtree. Moves keep the longest run of children already in order and move the rest.
- `native/ios/Renderer/` (UIKit) and `native/android/app/src/main/java/dev/kuito/runtime/renderer/` (Android Views) implement the same view operations with the same layout:
  - `Kuito*Renderer` owns the view tree only: create, move, remove (with `exiting`), clear.
  - `KuitoViewFactory` maps each Kuito kind to a native view and wires its events. Kinds native modules contribute (`module:<Name>`) come from `KuitoModuleViews` through the same lookup, and bring their own prop table, kept on the view's style ahead of the shared ones ([native views](native-modules.md#views)).
  - `KuitoEventEmitter` writes events in the wire format described in [events](events.md).
  - `properties/` holds one table per concern (animation, layout, decoration, text, controls), keyed by prop name; `KuitoProperties` merges them, rejects a prop claimed twice, and indexes the setters by prop key (`KuitoProperties.byKey`), so a record's key finds its setter without hashing a name. A module view's own props go first, by name. Add a prop to `src/protocol/manifest.ts` (its concern names the table), run `npm run generate`, then add an entry to that table on both platforms; `test/protocol-parity.test.ts` fails until each platform the manifest marks has the setter, and fails on a setter, view kind or event payload key the manifest does not list. Each table is one literal, so the test can read it.
  - `styling/` holds the per-view record (`KuitoViewStyle`, below), animation specs, colors and value parsing.
  - `KuitoCommands` maps each command to what it does. A command is a one-shot instruction (`focus`, `blur`, `keyboard.dismiss`, `accessibility.announce`, `accessibility.focus`, `accessibility.status`): the kernel writes a `Command` record into the host batch, after the mutations before it (docs/native-scheduling.md). Id 0 addresses the app.
  - `keyboard/` tracks the keyboard and moves avoiding views ([keyboard](keyboard.md)); `accessibility/` composes each view's accessibility props and reports status ([accessibility](accessibility.md)).

## One record per view

Each renderer keeps one map, `nodes`, from a view's number to its record,
`KuitoViewStyle`. The record is everything the renderer knows about the view:

- `view`: its native view, nil while the node is flattened. The layout node
  points at the same view; setting the record's sets the node's.
- `content`: where its children's views go when that is not the view (a
  Scroll's content).
- `layoutRoot` (iOS) and `sheet`: set for a view that lays out its own subtree,
  outside its parent's layout.
- `host`: set for a view that shows its children itself ([hosts](#hosts)).
- `exiting`: set once a removed view has left Kuito's tree but not the
  screen. `animated` while the UI thread runs its `exit`, whose props it still
  takes until `exited`; `transition` while its container's transition moves a
  page off screen. Any other mutation of it is a `missingView`. The record
  goes when the view has gone.
- Its layout node, gestures, and the style state of props that compose into
  one platform value (transform, text attributes, background).

Flattening changes one fact, the record's `view`, and the record stays.
`clear()` drops every record.

## Hosts

Most views' children are subviews the layout tree places. A few views show
their children themselves, and the renderer asks them through one interface,
`KuitoHost`, the same on both platforms:

| Method                    | What the host does                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `adopt(child, label, at)` | The child joins its children; a child it doesn't take is an `invalidTree` error.       |
| `move(child, to)`         | The child changes place among them; a child can't leave its host (`invalidTree`).      |
| `release(child, gone)`    | The child leaves at once; `gone` runs once it is off screen, after any transition.     |
| `animatesRemoval(child)`  | Whether releasing it now animates it out, so its subtree stays on screen until `gone`. |

A list hosts its rows (placed by key, so `move` does nothing), a navigation
stack its screens, a tab bar its tabs; a native module's view becomes a
container by adopting `KuitoHost`. Each child is a layout root of its own.

`KuitoStyled` is the other side: a view that keeps its record or reaches the
rest of the tree (a Pressable composes pressed feedback into its style, a
SafeArea writes its inset, a list asks for layout, a stack reads shared
elements, a sheet presents and routes its own window's gestures) gets
`style(record, tree)` once, when the renderer makes it. Every layout root
(a sheet, a page, a list row) is styled. The renderer never names a view's
class: on iOS the factory states a view's roles where it makes it
(`KuitoCreatedView`), so `KuitoUIKitRenderer` has no `as? Kuito…` cast.

## Errors

Every error a renderer throws is a `KuitoRenderError`, with the same four
cases on both platforms (`native/ios/Renderer/KuitoRenderError.swift`,
`native/android/.../renderer/KuitoRenderError.kt`). The shell discards the
mutation and reports the error ([LogBox](logbox.md)); nothing falls back.

| Case               | When                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupportedProp`  | The view takes no such prop or command: no table has it, or it is another kind's (`objectFit` on a `Box`).                            |
| `unsupportedValue` | The prop or command takes no such value. It names the prop, the value, the view and what the prop takes.                              |
| `invalidTree`      | The mutation makes a tree the renderer cannot show: a number in use, an unknown kind, a page outside its container, flattening twice. |
| `missingView`      | No view has the number.                                                                                                               |

A setter throws `context.unsupportedProp()` or
`context.unsupportedValue(value, reason)`. Code below a setter that has no
context (a gesture spec, a list's keys, a symbol's name) throws
`KuitoRenderError.Rejection(reason)`, which the renderer turns into
`unsupportedValue` for the prop being set; a command's rejection becomes
`unsupportedValue` for the command.

## Unset props

A prop arrives as null when it is unset: the app removes it or sets it to
`undefined`, or a style condition or variant that set it stops applying
([styles](styles.md)). What null means is each prop's `unset` rule in
`src/protocol/manifest.ts`, generated into `KuitoProps.unsetByKey` on both
platforms, and `KuitoProperties` resolves it before any setter runs:

| Rule        | Null does                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `{ value }` | What setting that value does: `opacity` 1, `fontSize` 17, `scrollbar` true. The setter never sees null.                          |
| `initial`   | Restores the view's own initial state, which no value writes: a layout prop's kind default, the platform's text color, no label. |
| `required`  | Throws `unsupportedValue`: a Symbol's `name` can't be unset.                                                                     |

So the typed-value readers (`context.number`, `context.color`, ...) reject
null, and only the setter of an `initial` prop checks for it, restoring what
the view had before the prop was first set. Layout props are `initial`: the
shared layout engine restores the kind's default. `test/protocol-parity.test.ts`
fails when a setter reads null for a prop with any other rule, and
`KuitoUnsetTests` / `KuitoUnsetTest` unset every prop on a device and compare
the view with the rule.

## Prop effects

Every prop in `src/protocol/manifest.ts` has an effect class, generated into
`PropEffect` (`native/shared/PropKeys.generated.h`), `KuitoProps.effectByKey`
on both platforms:

| Class       | What a write can disturb                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `paint`     | Color, opacity, a shadow's color, a scroll offset. The view redraws; layout is untouched.                                      |
| `measure`   | Text, font, an image's source: what a leaf measures. The climb stops at the first fixed-size ancestor its content cannot move. |
| `layout`    | Flex, size, padding, margin, position. The node and every ancestor lay out again, as a tree edit does.                         |
| `structure` | Keys, a cell's key, a view that leaves. The tree changes.                                                                      |

The JS thread folds a batch into that summary when it hands the batch off
(`summarize` in `native/shared/Effect.h`). A paint-only batch never marks
layout. A measure write calls `markContentDirty`: the fixed-size ancestor is
the one that lays out, at the size it already has, because a cache hit on
the screen root never visits a dirty descendant. A percent size is not
fixed. Nor is a box that can shrink along its parent's main axis: a flex
item's automatic minimum is the smaller of its size and its content's, so
its content still moves it and its siblings unless it has `flexShrink: 0`, a
minimum in points along that axis, or overflow other than visible.
`test/protocol-parity.test.ts` fails when a renderer stops consulting
`effectByKey`, and `test/frame-cost.test.ts` fails when a paint-only tap
frames a view.

On Android, a view's first background costs one layout: `View.setBackground`
requests a layout when the view had none, whatever the drawable. Writes after
that replace a drawable of the same minimum size and lay nothing out.

## Sample

```tsx
import { Button, Text, VStack, signal } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

The kernel plans the three views once; a press writes `count`, and the
`Text` alone updates; nothing re-plans.

## Local validation

Run `npm test` for pure JS/VM contract tests, and the renderer tests on a simulator and an emulator (`CLAUDE.md` names the commands).

The iOS suite runs in Debug and in Release (`-configuration Release ENABLE_TESTABILITY=YES`), which
compiles the renderer as shells ship it. Tests of what Release compiles out, the cost counters and
frame receipts ([performance](performance.md#cost-counters)), skip there with a reason. Android's
suite builds against the debug variant only: Gradle makes instrumented tests for one build type, and
the tests use debug's own sources (`src/debug`: devtools, cost replay, frame receipts), which the
minified release variant does not have.

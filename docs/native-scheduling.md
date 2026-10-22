# Native scheduling and the host batch

Hermes calls C++ in-process through JSI; there is no serialized bridge. Each
JS job (an evaluation, an event, a timer, a network completion, a module
callback) sends the platform at most one batch of typed view mutations, and
the platform applies batches in order on its UI thread.

## Threads

- Android: one `HandlerThread("KuitoHermes")` creates, runs and destroys the
  Hermes runtime. The main looper owns every View. Timers and OkHttp
  completions post back to the Hermes thread.
- iOS: one serial `dev.kuito.hermes` queue owns the runtime, evaluations,
  events, timers and URLSession completions. Batches go to the main queue.
- The UI-thread runtime (docs/motion.md) runs on the platform UI thread next to
  the views; the props it writes are applied before its entry point returns.

## The batch: one call per job

The kernel writes every view mutation of a job as a record into one
`ArrayBuffer` (`src/runtime/wire.ts`) and sends it with one call,
`__kuitoHostCommit(buffer, byteLength, strings)`. C++ decodes it once into
typed `Mutation`s (`native/shared/Wire.h`, `Mutation.h`).

Records are little-endian and packed; strings travel beside the buffer and a
record names them by index:

| Op            | Fields                                                            |
| ------------- | ----------------------------------------------------------------- |
| 1 `Create`    | `u32 id`, `u32 parent` (0: the root), kind, label, `u8` flattened |
| 2 `Remove`    | `u32 id`                                                          |
| 3 `Move`      | `u32 id`, `u32 parent`, `u32 index`                               |
| 4 `Flatten`   | `u32 id`, `u8` flattened                                          |
| 5 `Prop`      | `u32 id`, `u16 key` (0xffff: a name follows), value               |
| 6 `Command`   | `u32 id` (0: the app), name, argument                             |
| 7 `UI`        | the UI-thread operations, a list of plain data                    |
| 8 `UIScript`  | source, url: a revision of the app's UI bundle                    |
| 9 `UIKernel`  | hash: load the UI kernel the shell ships, `ui.hbc`                |
| 10 `UIBundle` | hash, url: load the app's UI bundle the shell ships, `app-ui.hbc` |

A value is a tag and its payload: null, a `f64` number, false, true, text, a
key diff, a struct or a list. A key diff is a `u32` count, then each edit as a
`u8` op (insert, remove, move), a `u32` index and the key: a list's keys as
edits to the keys sent before (docs/lists.md#keys). Only a prop of the
manifest's `keys` type takes one, and such a prop takes nothing else but null.
A struct is a `u32` count, then each field's name and value; a list a `u32`
count, then each value. They carry plain data as JSON would hold it, written
field by field with no JSON made: an object's undefined fields are left out,
a number JSON cannot hold is null, and C++ refuses data nested deeper than 64. JSON text (tag 5) is only what a recording made before plain data holds.

A prop key is the prop's index in `src/protocol/manifest.ts`
(`native/shared/PropKeys.generated.h`, the kernel's `PROP_KEYS`); a module
view's own prop goes by name, even one a built-in kind declares too (a
TextField's `type`), and only the props every kind takes keep their keys. Views are numbers the kernel gives out and never
reuses; the label (the app's `id`, or the kernel's path) crosses once, with
the create, for error messages and for a list to adopt the cell it asked for.

C++ types each value by its prop's manifest kind: a color arrives as hex text
and is parsed once to `0xRRGGBBAA`, an enum becomes its index among the
manifest's values, a number must be a number. A value of the wrong kind
rejects the batch, naming the prop.

The kernel names each string once, so the decode takes it from the batch's
table rather than copying it, and a second use of an index rejects the batch.
An enum crosses to the renderers as its index alone: they read its text from
their generated tables (`KuitoProps.valuesByKey`), and Android makes each
enum's `KuitoValue` once. Android makes the Java strings a batch repeats,
a create's kind and a command's name, once for the process
(`JavaBatchCache` in `JavaValues.h`), and finds its array classes once.

## Structured props

A prop of the manifest's `json` type that a renderer receives (`gestures`,
`src`, `backgroundGradient`, a list's `scrollTo`, ...) has a schema in
`src/protocol/schemas.ts`: scalars, enums, lists, string-keyed maps, structs
with optional fields, and `oneOf`s that tell their variants apart by type, by
a field present or by a field's text. A plain string or number such a prop
takes (an image's URL, a field's count of lines) is one of its variants.

C++ checks the value against the schema once, as the batch is decoded
(`native/shared/Schema.h`, the tables in `PropSchemas.generated.h`), and lays
it out as a record of numbers and strings in the schema's order: a boolean as
1 or 0, a color as `0xRRGGBBAA`, an enum as its index, an optional field as 1
and its value or 0, a list or map as its count and then its items, a `oneOf`
as its variant's index and then the variant. A value that does not fit
rejects the batch, naming the field: `backgroundGradient.colors[0] expects a
hex color, got "red"`. The renderers read the record through the value types
`npm run generate` makes for both platforms (`KuitoPropValues.generated.swift`
and `.kt`), so no renderer parses text. A native module's view, whose props
the manifest does not describe, gets an object prop as JSON text.

The UI thread's side carries plain data the same way: the operations a `UI`
record holds reach the UI kernel as values C++ builds from it, a motion
value's mirror holds plain data rather than JSON, and the UI kernel's
messages to the JS thread cross as values (docs/motion.md).

When the batch goes:

- A commit (`src/runtime/transaction.ts`) sends its records alone, when its
  work ends: a batch the host rejects is exactly the commit the kernel undoes.
- Other writes (a binding's new value, an element's `setProperty`, a command)
  wait for the scope around them to end, a native event's dispatch, and go at
  once outside any.
- UI-thread operations go with the next batch, after the views they name; with
  no batch coming, at the end of the task.

## Layout props

The shared engine (`native/shared/layout/KuitoLayoutStyle.cpp`) takes a
layout prop by its key and its value as the batch typed it: a number, a
boolean as 1 or 0, an enum by its index among the manifest's values, or a
length written as text (`50%`, `auto`, `fit-content(120)`), read in place.
Its setters are a table indexed by key, and each enum's manifest values are
read into engine values once, so a write hashes no name and parses no enum.
It applies the manifest's layout props and the decoration props that lay out
too (`laysOut`: `borderWidth`, `overflow`); `test/protocol-parity.test.ts`
holds the two to the same list.

The renderers still receive layout records and hand them on (the iOS
`KuitoLayoutNode`, Android's `KuitoLayoutNode` over JNI): they own each
view's node, its place in the tree and what a change does next, laying the
view out again, at once for a value the UI thread drives (docs/motion.md),
the update highlight, a list's gaps, `hidden` on the view. On iOS the value
reaches C++ without a copy; on Android only a length's text crosses JNI as a
string. On a 501-view first render (`test/layout-props.test.ts`), 50 strings
reach the engine, each card's `width: 100%`, for 1,608 layout props.

The boxes come back in one array per pass: on Android the engine writes every
node's box of the tree it laid out into one `double[]`, which each node reads
from its slot (`KuitoLayoutJNI.cpp`, `publish`). While no tree's structure
changes, a pass fills the same array again and sets no Kotlin field, and a
node's box object stays the same; a node joining or leaving a tree makes the
next pass's array a new one, so a node out of the tree keeps reading its last
boxes rather than a slot another node took. On a 671-node tree on the Android
emulator, a pass the engine answers from its caches went from 317 to 136 µs.

## The view table

`native/shared/ViewTable.{h,cpp}` holds `id → { kind, label, parent }` for
every view the batches built, and checks each batch against it before any of
it reaches the platform. It rejects, whole:

- a create of an id that exists,
- an insert (a create or a move) under a parent that does not exist,
- a remove of a parent before its children,
- a write or command to a view that is gone.

A rejected batch throws in the kernel's `__kuitoHostCommit` call, where the
commit's journal undoes the kernel's side. The journal holds each entry of
kernel state once per commit, as it was before the commit's first write to
it, so a view that writes many props in one commit is journaled once. The job's accepted batches join the
job's `MutationQueue`; a job that throws later discards them and the table
takes them back, so the table and the platform never see half a job.

`MutationQueue` keeps structural records in order and only the last write per
prop within each fenced span (creates, removes, flattens, commands and UI
records fence; moves do not), at the position of that last write. A key diff
edits what came before it, so it is never dropped and no write of its prop
merges across it.

## The platforms

- iOS: the bridge hands Swift the job's mutations as a C array of
  `KuitoMutationRecord` (`native/ios/Renderer/KuitoMutationRecord.h`), a view
  of the C++ `Mutation`s read in place; `KuitoUIKitRenderer.apply(_:)` runs
  each one. Swift does not import the C++ types themselves: that would switch
  every Swift target to C++ interop for one struct.
- Android: one JNI call per batch with parallel primitive arrays (op, value
  kind, key, id, parent, an int, a number, text, name, and a key diff's
  edits), read by `KuitoMutations`; `KuitoAndroidRenderer.apply` runs each
  record.
- Renderers key their views by number and keep one map, id → the view's
  style; a view's parent is on its style. It is not always its layout node's
  parent: a page, a sheet or a list row is a layout root of its own, so the
  layout tree alone cannot be the hierarchy. Setters receive a typed `KuitoValue`
  and parse no scalar; a native module view's own props decode `untyped`, the value
  as a scalar (docs/native-modules.md#views).

## The frame

Batches cross to the UI thread in one place, `native/shared/FrameHandoff.h`,
which both runtimes share. The JS thread pushes each job's batch; the first
one an idle handoff gets asks the platform for a display frame (a
`CADisplayLink` on iOS, `Choreographer` on Android), the only frame callback
either shell has.

On that frame, `UIRuntime::drain(now, budget)` applies the waiting batches in
order for up to ~4 ms, at least one whatever it costs, each through the
platform's renderer (whose `ui` and `ui-script` records go back to the UI
runtime, in order). Then it runs the UI kernel's frame, after the batches, so
motion sees the views they made. It asks for another frame while batches wait
or something animates. A batch pushed while it drains waits for the next frame.

A frame that ends with batches it was due to apply marks the handoff busy:
the UI thread is behind. The kernel reads it through `__kuitoHostBusy()` and
holds its structural re-plans meanwhile, since their batches would only queue
behind the ones not yet applied. Writes still go at once. The drain that
catches up sends the app event `host.idle` (docs/events.md), and every re-plan
that waited runs once, for all the writes behind it.

## Events

Native events cross the other way as `(handle, event, payload)`: the view's
number (0 for the app), the event's name and its payload, in the typed record
its layout fixes, or JSON for a module view's own event
(docs/events.md#typed-events). C++ checks the record once and writes its
numbers into each kernel's reusable buffer. A UI-thread handler takes an event
first, before the frame (docs/placement.md); any other goes to the JS thread,
the same record unread.

## Input

A press, a change or a field's edit for a `format` the JS thread handles
([keyboard](keyboard.md#formatting)) answers in the frame the touch lands
in when its job is quick. The main thread asks the handoff for the
job's number (`FrameHandoff::expectInput`), posts the job, and waits for it
up to `FrameHandoff::INPUT_BUDGET`, 4 ms; the JS thread says when the job
ended (`inputDone`), its batch, if it made one, already pushed. A job that
ends in time is applied at once: the main thread drains the handoff
(`UIRuntime::drain`) inside the touch's own input handling, before the frame
is drawn. That drain runs at the display's latest frame at or before now
(`native/shared/FrameClock.h`), not at now: the display frame that follows
runs at that frame's timestamp, which the touch may come after, and the UI
kernel's animations would step back. iOS steps from the display link's last
timestamp by its duration; Android from the last `Choreographer` frame time by
the display's refresh period (`KuitoFrameClock`), since its frame callbacks
are posted only while there is work and the gap between two spans idle time.

A job that runs past the budget falls through to the next display frame as
any batch does. Other events never wait, and neither does an event
a batch fires while it applies (Android's field runs its `TextWatcher`
inside a text set): draining for it would apply batches inside that
batch, so its job reaches the JS thread and its batch the next frame.

On the Android emulator this took Reel's median touch-to-applied latency from
19 to 11 ms on one core and from 16 to 8 ms on two, with the p95 unchanged
([the spike](sync-input-commits.md)).

## Verification

`test/native-batch.cpp` (run by `npm test`) decodes records of every kind,
rejects malformed ones and values of the wrong kind, and checks the table's
rejections, its whole-batch rollback, the queue's coalescing and the frame
handoff's budget, busy flag and input wait, and that an input fired while a
batch applies never drains inside it. `test/incremental.test.ts` checks that re-plans
wait while the host is busy and run once on `host.idle`.
`test/native-batch.test.ts` checks the kernel's side: one host call for a first
render and for an event, typed values, UI operations after the views they name,
and a rejected batch undone in the kernel.

# Jobs, threads and frame commits

Use this page when changing event delivery, the native boundary or frame scheduling. A JavaScript job collects view changes into a typed batch; the UI thread applies committed batches in order.

## Thread ownership

| Work                                           | Owner                                 |
| ---------------------------------------------- | ------------------------------------- |
| App JS, events, timers and network completions | Serial Hermes thread/queue            |
| Native views, layout and rendering             | Platform main thread                  |
| Motion and placed gesture callbacks            | Hermes UI runtime on the main thread  |
| Background native operations                   | The module's serial background thread |

Android uses `KuitoHermes`; iOS uses the serial `dev.kuito.hermes` queue. A platform callback queues JS work onto its runtime owner. Do not call a Hermes runtime concurrently from arbitrary callback threads.

## Commit a batch

`src/runtime/wire.ts` writes little-endian records into one `ArrayBuffer`, with a separate string table. `__kuitoHostCommit` hands it to C++ through JSI. `native/shared/Wire.h` decodes and validates the records before platform application.

| Operation                         | Purpose                              |
| --------------------------------- | ------------------------------------ |
| `Create` / `Remove`               | Add or release a numbered view       |
| `Move`                            | Change parent or sibling position    |
| `Flatten`                         | Promote or demote a layout-only node |
| `Prop`                            | Set or remove a property             |
| `Command`                         | Perform a view/app operation         |
| `UI` and UI script/bundle records | Install or update UI-runtime work    |

View numbers are not reused. Human-readable labels cross with creation for diagnostics. Built-in prop keys and value schemas come from `src/protocol/manifest.ts` and `src/protocol/schemas.ts`; generated Swift/Kotlin readers share that contract.

## Validate properties once

Numbers, colors, enums and structured values decode into typed records. A bad field rejects the batch with the property path. Structured built-in props use generated schemas; custom module view props are decoded by that module's declared native prop types. Unsetting a prop restores its native default.

One transaction sends its records together so a rejected batch corresponds to the commit the kernel can undo. UI operations follow the views they reference. Event scopes and microtasks group ordinary signal writes; see [reactivity](reactivity.md).

## Input and frame timing

An input handled on the JS thread can wait briefly for its resulting commit. For press/change events, the main thread waits up to 4 ms. If the job finishes, its batch can land in the input's frame; otherwise normal frame scheduling resumes. Other events do not wait. UI-thread handlers update placed properties directly.

This bounded wait trades a small amount of main-thread time for lower touch latency. Keep input handlers short and measure the tail latency when changing this path. The historical [input experiment](sync-input-commits.md) records the measured decision.

## Check a scheduling change

Exercise a single signal write, several writes in one event, an async completion, a rejected prop batch and view removal during pending work. Compare native operation counts and device frame reports through [performance tools](performance.md). Headless tests check mutation behavior; device tests establish actual thread and frame timing.

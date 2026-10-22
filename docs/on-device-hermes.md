# Embed Hermes on the device

Kuito executes app JavaScript inside the iOS or Android process. The desktop development server compiles and sends updates; it does not run the app's event handlers on behalf of the phone.

## Runtime ownership

`native/shared/KuitoRuntime.cpp` owns the shared embedding and host functions. The iOS wrapper schedules evaluations on its serial runtime queue; Android's JNI wrapper uses its Hermes thread. View batches are handed to the platform main thread.

A second Hermes runtime on the UI thread handles motion and compiler-placed callbacks. Values crossing between runtimes use Kuito's explicit contracts; a JavaScript object is not shared implicitly between them.

## Development and release

| Mode        | What loads                                   | How it changes                                        |
| ----------- | -------------------------------------------- | ----------------------------------------------------- |
| Development | Runtime kernels and app source               | Live Patch in the persistent runtime                  |
| Release     | Optimized Hermes bytecode and bundled assets | New native build or compatible signed bytecode update |

The build pins Hermes and its compiler together. Do not compile bytecode with an arbitrary local Hermes version: the bytecode format must match the embedded runtime. Native code changes always require a native build.

## Find an embedding failure

If the shell starts but no screen appears, inspect the startup state and platform log before debugging app layout. Check runtime creation, kernel evaluation, app evaluation and the first committed frame separately. [DevTools](devtools.md) attaches to each development runtime; [crash reports](crash-reports.md) diagnose release failures.

For embedding changes, verify startup, events, promises, timers, native calls, runtime shutdown and compatible Live Patch on both platforms. A host test alone cannot establish JNI/Objective-C lifecycle or device behavior.

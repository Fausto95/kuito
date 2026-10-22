# Compiler and runtime design

Kuito compiles TSX into native-view descriptions and reactive bindings. App logic runs in Hermes inside the native process. UIKit or Android Views render the result using a shared layout engine.

This page is for contributors deciding where a change belongs. App authors can start with [build a screen](primitives.md).

## Follow one state change

```tsx
import { Button, Text, VStack, signal } from 'kuito';

export function Counter() {
  const count = signal(0);
  return (
    <VStack>
      <Text>{count.value}</Text>
      <Button onPress={() => count.value++}>Add</Button>
    </VStack>
  );
}
```

The compiler turns the text expression into a binding. The runtime records its read of `count`. A press resolves the current handler, writes the signal and updates the text property. The component body is not rerun for that write. A structural expression instead replans its affected branch.

## Ownership by layer

| Layer              | Responsibility                                                                 | Start reading                      |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------------- |
| Compiler           | TSX lowering, binding metadata, stable component identities, CSS, UI placement | `src/dev/`                         |
| Bundler            | Resolve and bundle app code and npm dependencies                               | Rolldown integration in `src/dev/` |
| JS runtime         | State, subscriptions, tree planning, reconciliation and lifecycle              | `src/runtime/`                     |
| UI runtime         | Motion, gesture callbacks and frame-dependent properties                       | `src/ui-thread/`                   |
| Shared host        | Hermes embedding, typed mutation decoding and layout                           | `native/shared/`                   |
| Platform renderers | Views, platform events, commands and native resources                          | `native/ios/`, `native/android/`   |
| Native modules     | Platform capabilities behind generated contracts                               | `native/modules/`, `src/native/`   |

The host API and mutation format are separate from the execution backend. Hermes revision and bytecode compatibility are pinned together. Static Hermes/AOT experiments are historical research, not the current app build contract.

## Preserve identity and cleanup

State belongs to a component instance and a compiler-named hook slot, not a line number or hook call order. Native handlers retain IDs and resolve the current closure when called; platform objects must not keep obsolete JavaScript closures across patches.

Planning should avoid external side effects. Native mutations are not generally reversible, so rejection and reconciliation must preserve the previous UI as far as the commit protocol allows. Every subscription, asynchronous task and native resource needs an owner and disposal path.

## Choose the next page

- [Scheduling](native-scheduling.md): jobs, batches, input and frame commits.
- [Renderer](native-renderer.md): native views, properties and layout.
- [Flattening](flattening.md): layout nodes without platform views.
- [Hermes embedding](on-device-hermes.md): development source and release bytecode.
- [Live Patch](incremental.md): component fingerprints and retained state.
- [Native modules](native-modules.md): extending platform behavior.

Earlier design decisions and measurements remain in [history](history.md) and the repository's experimental notes.

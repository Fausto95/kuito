# How Kuito works

Follow an app from TypeScript source to a native screen. These pages explain implementation choices for contributors and help app authors diagnose behavior that spans the compiler and runtime.

## Compilation and state

[Compiler and runtime design](../../../docs/architecture.md) explains ownership across the compiler, bindings, runtime and native host. [Live Patch](../../../docs/incremental.md) explains which edits retain state and which reset a component.

<!-- diagram: kuito-architecture.svg -->

## Threads and frames

[Scheduling](../../../docs/native-scheduling.md) follows an event through a JavaScript job, a typed mutation batch and a frame commit. [Hermes embedding](../../../docs/on-device-hermes.md) covers runtime ownership and source versus bytecode.

<!-- diagram: kuito-threads.svg -->

## Native views

[The renderer](../../../docs/native-renderer.md) maps plans to UIKit and Android Views. [Flattening](../../../docs/flattening.md) removes native objects from layout-only wrappers. [Native modules](../../../docs/native-modules.md) add capabilities and custom views.

<!-- diagram: kuito-renderer.svg -->

## Apply this knowledge

For a slow interaction, start with [performance](../../../docs/performance.md). For a gesture that falls back to JavaScript, read [placement](../../../docs/placement.md). For ordinary app work, start with [your first app](../../../docs/apps.md).

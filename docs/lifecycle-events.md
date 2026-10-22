# Component lifecycle and logical native events

## Current experimental APIs

- `onMount(callback)` runs after a successful host view commit; a returned function is cleaned up on instance disposal; compatible refresh retains the same mounted instance.
- `onCleanup(callback)` registers cleanup without running on mount.
- `watch(source, observer, {immediate?})` observes the selected signal value, skipping initial notification by default. Dependencies are retracked as the source changes. A watch compares values for its instance's lifetime: when the instance re-runs (new props, a re-planned branch), a selected value that differs from the last one it saw notifies the observer.
- `effect(callback)` tracks synchronous signal reads and runs after mounting; returned cleanup runs before re-execution and during teardown.
- `ref()` returns a stable view handle for native view IDs; handles provide logical parent/children, `setProperty`, `focus`/`blur` host commands, and EventTarget-like listeners.
- Native press is delivered through capture, target, and bubble phases; `dispatchEvent` accepts custom event-shaped objects. Native host dispatch is still a proof of concept, not a W3C conformance implementation.

## Limitations

- Fast Refresh currently recreates the component descriptor tree. Unchanged component lifecycle scopes are retained on compatible refresh; changed effects are replaced, and stable handles survive while view identities are retained.
- `focus` and `blur` require a real platform-native command implementation and throw a descriptive error if absent.
- `setProperty` writes imperatively; subsequent signal commits can overwrite this value.
- Event cancellation applies to Kuito's logical event graph; it does not automatically stop an already-issued UIKit/Android OS action.
- Cleanup callbacks are not currently transactional: an exception during a cleanup after host commit cannot roll back native view mutations.
- Event argument typing and passive listeners, accessible semantics, composed portals, and nested lifecycle scope disposal are incomplete.

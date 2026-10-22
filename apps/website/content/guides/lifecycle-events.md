# Lifecycle events

Lifecycle hooks run code around a component's host view commit, and view handles expose native views and their logical events. These APIs are experimental.

## Lifecycle hooks

- `onMount(callback)` runs after a successful host view commit; a returned function is cleaned up on instance disposal. A compatible refresh retains the same mounted instance.
- `onCleanup(callback)` registers cleanup without running on mount.
- `effect(callback)` tracks synchronous signal reads and runs after mounting; returned cleanup runs before re-execution and during teardown.

## Watching a value

`watch(source, observer, { immediate? })` observes the selected signal value, skipping initial notification by default. Dependencies are retracked as the source changes. A watch compares values for its instance's lifetime: when the instance re-runs (new props, a re-planned branch), a selected value that differs from the last one it saw notifies the observer.

## View handles and native events

`ref()` returns a stable view handle for native view IDs. Handles provide logical parent/children, `setProperty`, `focus`/`blur` host commands, and EventTarget-like listeners.

Native press is delivered through capture, target, and bubble phases; `dispatchEvent` accepts custom event-shaped objects. Native host dispatch is a proof of concept, not a W3C conformance implementation.

## Limitations

- Fast Refresh recreates the component descriptor tree. Unchanged lifecycle scopes are retained on compatible refresh; changed effects are replaced, and stable handles survive while view identities are retained.
- `focus` and `blur` require a real platform-native command implementation and throw a descriptive error if absent.
- `setProperty` writes imperatively; subsequent signal commits can overwrite this value.
- Event cancellation applies to Kuito's logical event graph; it does not stop an already-issued UIKit/Android OS action.
- Cleanup callbacks are not transactional: an exception during a cleanup after host commit cannot roll back native view mutations.
- Event argument typing and passive listeners, accessible semantics, composed portals, and nested lifecycle scope disposal are incomplete.

## In depth

[Component lifecycle and logical native events](../../../../docs/lifecycle-events.md) covers the same APIs and limitations in their original form.

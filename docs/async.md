# Kuito async runtime — experimental

Kuito has **component-scoped** async actions and resources. These are implemented
in the plain-JavaScript Hermes kernel and tested in Node's isolated VM. Timers,
`fetch` and the rest of the standard library they build on are listed in
[web-apis.md](web-apis.md), with what each does not do.

`async`/`await` works in app code on both platforms. App bundles target ES2022,
which Hermes V1 compiles as written, so async functions stay native. Hermes V1
rejects async generators (`async function*`, and `for await` over one); the
bytecode compiler reports them at build time, and a Live Patch that uses one
fails to evaluate on the device.

## Public API

```tsx
import { task, resource, VStack, Text, Button } from 'kuito';

declare function saveChanges(options: { signal: AbortSignal }): Promise<void>;

function Example() {
  const query = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/api', { signal });
    return response.json();
  });

  const save = task(
    async ({ signal }) => {
      await saveChanges({ signal });
    },
    { policy: 'drop' },
  );

  return (
    <VStack>
      <Text>{query.running.value ? 'Loading...' : String(query.data.value ?? '')}</Text>
      <Button
        onPress={() => {
          void save.run().catch(() => {});
        }}
      >
        Save
      </Button>
    </VStack>
  );
}
```

## Execution and lifecycle

- `task()` starts only when its `run(...args)` method is called, and normally
  returns a rejecting Promise on failure. The caller handles rejections.
- `resource()` starts after a successful patch commit and exposes `refresh()`.
  Resource failures populate `error.value` rather than causing an unhandled
  rejection from automatic loading. When the component does not render
  `error`, the failure goes to the [`Catch`](control-flow.md#catch) around
  it, or to the reporting seam when there is none. A
  [`Loading`](control-flow.md#loading) around it shows its fallback until the
  load settles.
- Both expose persistent `running`, `data`, and `error` signals and
  `cancel()`. Task policies: `replace` (cancel previous, last-result-wins) and
  `drop` (reuse in-flight Promise).
- On a compatible Fast Refresh, old async records are invalidated/aborted, while
  the signal objects remain stable. Stale continuations cannot commit results.
  On rejected patches, old work remains active. Component disposal cancels work.
- Abort is cooperative. Non-abortable operations may finish, but their stale
  results never update Kuito async state. The signal is the kernel's own
  `AbortSignal` ([web-apis.md](web-apis.md#abortcontroller)), so passing it to
  `fetch` cancels the request.
- A task or resource keeps its slot by name, like every hook
  (`docs/reactivity.md`): adding, removing or reordering hooks around it keeps
  its signals, and removing it disposes it.

## Promise host integration

The shared mobile Hermes runtime now calls `drainMicrotasks()` after source
evaluation and event dispatch. This is a checkpoint for Promise jobs; it does
**not** provide an event loop. External native callbacks must re-enter the owning
VM thread and drain jobs again.

Timer, HTTP and module callbacks re-enter the VM thread as jobs of their own,
each followed by a microtask checkpoint.

Current UI reactive bindings observe the dependencies captured on their initial
evaluation. Branch-dependent signal dependencies still need dynamic retracking.

## Next native milestones

1. Add independent native workers, resource caching and measured device performance.

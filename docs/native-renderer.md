# From a view plan to native views

The renderer applies Kuito's typed mutations to UIKit and Android Views. Use this page when adding a primitive, property, event or child-hosting view.

## Follow a mount

The runtime plans the component tree, allocates stable view numbers, reconciles it with the prior plan and commits changes. Each platform keeps a record for every logical view: the native object when present, layout node, gestures and exit state.

A factory creates each built-in kind. Module kinds resolve through the generated native module view registry. The shared layout engine computes frames; the platform renderer applies them. A compatible patch retains the object and updates only changed props.

## Add a property

Declare the property and its value shape in `src/protocol/manifest.ts` and, for structured values, `src/protocol/schemas.ts`. Generate the shared contract, implement both platforms and verify parity. A property must define how removal restores its default, not only how an initial value is set.

Separate changes that affect measurement/layout from paint-only changes. Changing opacity should not require text measurement. Use [cost tests](performance.md) to verify that distinction.

## Host children correctly

A plain container inserts children into its native hierarchy. Scroll views, lists, navigation containers and custom module hosts may own another content view or platform controller. Implement the host contract so insert, remove, move and reparent operations reach that content correctly.

Logical ancestry remains meaningful even when a node is [flattened](flattening.md). Do not infer logical parentage only from the native hierarchy.

## Handle removal and errors

Release subscriptions, gestures and external native resources when the runtime unmounts a view. Exit animations may keep its visual object briefly after logical removal; they must not revive its subscriptions. A hidden or offscreen view is not necessarily unmounted.

Reject unsupported values with the property and view identity in the error. Keep iOS and Android behavior aligned; document intentional platform differences in the component or property reference.

## Validate the change

Build both platforms, exercise set/update/unset, and test moving or removing the affected view. Check events from real input and ensure prop application does not echo a fake user-change event. Headless tests verify the mutation contract; native tests and manual device checks verify platform behavior.

Related: [events](events.md), [native modules](native-modules.md), [scheduling](native-scheduling.md).

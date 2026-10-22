# Component-level incremental refresh

Kuito's development compiler assigns stable `modulePath#functionName` IDs and
source fingerprints to named component functions. The runtime retains a
per-instance descriptor cache keyed by module ID and logical component path.

A component's fingerprint covers its own code and every top-level statement
of its module it reads, directly or through other top-level statements: editing
a constant or helper re-runs the components that read it, and only those. Reads
are resolved by binding, so a name the component declares itself is not a read
of the module's statement of that name. A component another one only renders as
JSX (`<Card />`) is not read: its own fingerprint covers its edits.

A fingerprint hashes the syntax tree, not the text: positions, comments,
parentheses, quote styles and JSX indentation do not count. An edit that only
reformats or comments code re-runs no component and sends no prop. JSX
expressions are keyed the same way, and so are UI-thread functions
(`docs/motion.md`).

On source refresh, unchanged components with unchanged prop identity reuse their
previous descriptor tree, preventing reruns of arbitrary code in those
components. Nested child components are resolved through a fresh definition
registry, so editing a child can update it even when its parent stays cached.

A component instance is its place in the tree, its component definition and
its `key`, all three in its path: `<parent path>.<place>.c<definition>:<key>`.
A `key` counts wherever an element is, in a list or as a single child. So a
place that renders another component, or the same one with another key, holds
a new instance with a path of its own, whose views get new labels and remount,
and the instance that left releases its state (`docs/control-flow.md`). A view
with an `id` prop is the exception: its label is the id, so it stays the same
native view wherever it renders, as long as its kind and parent do.

Any re-plan, a refresh or a `Show` toggle, sends a native view only the props
that changed: scalars compare with `Object.is`, and object props (`style`,
`gestures`, gradients) by the JSON they last crossed the host boundary as,
since the planner rebuilds them on every walk. A `Show` toggle plans only its
branch (`docs/control-flow.md`).

State slots, native view identity, refs and instance-lifetime `onMount` records
are retained while an instance's path lasts. Within an
instance, each hook keeps its slot by name, not by call order
(`docs/reactivity.md`): adding, reordering or conditionally calling hooks keeps
the others' state.
Effect/watch scopes and async work are disposed and replaced when their owning
component executes again; unchanged component scopes remain intact. A hook a
patch removes is disposed, and removed components release the state, async
and lifecycle scopes of all their hooks.

**Remaining limitations:** This is per-component memoization during HMR, not
an incremental source bundler: Rolldown still regenerates a JS bundle. A
component with changed source reruns its function, so expressions outside
fine-grained cached bindings may reevaluate. A value imported from another file is covered by
its `import` statement only, so a component that reads a constant edited in
another file stays cached until its own module changes. Props comparison is shallow
`Object.is`; mutable objects can invalidate correctness. Newly composed
components without stable compiler identities fall back to reexecution.
Conditional children without stable keys may change identities when reordered.
Host mutations are not transactionally reversible, and effects run on the
current VM/UI thread. Avoid side effects in component function bodies.

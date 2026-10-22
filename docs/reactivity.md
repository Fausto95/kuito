# Reactivity

## Signals

A signal holds a value that changes. JSX that reads it follows it, without
re-running the component:

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

const theme = signal<'light' | 'dark'>('light'); // shared by every component

function Counter() {
  const count = signal(0); // this component's own, kept across Live Patches
  const doubled = computed(() => count.value * 2);

  watch(count, (next, previous) => console.log(previous, '→', next));

  return (
    <Pressable
      onPress={() => {
        count.value++;
        theme.value = 'dark'; // one update with the count, no batch() needed
      }}
    >
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)` made while a component sets up belongs to that component's
  slot (below); made anywhere else it is a signal of its own. A component's
  signals that only its views' props and its handlers use live on the UI
  thread ([Placement](placement.md#signals-on-the-ui-thread)); nothing about
  using them changes.
- `computed(fn)` is a read-only signal of what `fn` returns, computed on first
  read and again only once a signal it read changed. One that reads only a
  component's placed signals and motion values moves to the UI thread with
  them, where it runs on each read instead
  ([Placement](placement.md#signals-on-the-ui-thread)).
- `watch(source, fn)` runs `fn(next, previous)` when the signal, or what the
  function `source` reads, changes. In a component it ends when the component
  unmounts; elsewhere it runs from now on. Either way it returns a
  subscription whose `remove()` stops it.
- `effect(fn)` re-runs `fn` whenever what it read changes.

Writes batch themselves. Everything one native event writes reaches the
screen together, in one host batch. A write anywhere else (after an `await`,
in a timer) opens a batch that ends on the next microtask, so the writes
until then go together too. A read is always current: a `computed` read right
after a write sees it. What runs later is only what listens: bindings,
`watch` and `effect`.

A prop takes a value or a signal (`Prop<T>`): `opacity={level}` follows
`level`, as `opacity={level.value}` does, since the compiler makes every JSX
expression reactive. A function in a prop is always a handler, so a
hand-written thunk (`opacity={() => level.value}`) is a type error: write the
expression, or derive a signal with `computed(() => …)`. Children and `Show`'s
`when` take signals the same way.

A `.value` read in a component's body, outside JSX and outside any function,
sees the first value only, because the component sets up once. The compiler
warns about it with the file and line, and the CLI shows the warning.

### How updates flow

Each read that a binding, a `computed`, a `watch` or an `effect` depends on is
one link in the kernel's graph (`src/runtime/reactive-graph.ts`), threaded on
two lists: the signal's readers and the reader's sources.

- A write walks the signal's readers in the order they started following it.
  A `computed` is marked stale at once, and its own readers with it; every
  binding, `watch` and `effect` is queued once for the end of the batch.
- When the batch ends, each queued reader runs once, in the order it was
  first queued. One that reads a `computed` runs only if that computed's
  value changed. A reader queued again while others run, runs again after
  them. A `computed` that throws there is reported with the reader that
  reads it, and the other readers still run.
- A reader that runs again reads its sources again in order and reuses the
  link it had for each, so a write and the updates it causes allocate nothing
  per reader. A link is made for a signal read the first time and dropped
  for one no longer read; a reader starts following what a run read once the
  run has ended.
- A `computed` nobody follows still knows its sources, but they do not hold
  it: it goes away with whatever made it, and its next read checks whether
  they changed.

What a write costs as readers grow is in
[kernel-signals.md](../benchmarks/kernel-signals.md).

## Stores

`store(initial)` makes an object or an array whose every path is a signal,
after Solid's mutable stores:

```tsx
import { Pressable, Text, store } from 'kuito';

const shelf = store({ books: [{ id: 1, title: 'Dune', liked: false }] });

function Book() {
  return (
    <Pressable onPress={() => (shelf.books[0].liked = true)}>
      <Text>{shelf.books[0].liked ? '♥' : '♡'}</Text>
    </Pressable>
  );
}
```

- A read through the store tracks that path alone: the label above follows
  `books[0].liked`, and a write to `books[0].title` leaves it alone.
- A write through the store notifies the bindings that read what changed,
  batched like any signal write. Array methods (`push`, `splice`, `sort`)
  write through it too: an expression that read `books.length` or mapped the
  array follows them, and `Object.keys` and `in` follow keys that come and
  go.
- It wraps `initial` rather than copying it, and each object has one proxy:
  `shelf.books[0] === shelf.books[0]`. A store object assigned into another
  path is stored as its plain object, so the data stays plain (it
  `JSON.stringify`s as it is). Write through the store: a change made to the
  plain object directly reaches nobody.
- Plain objects and arrays inside it are stores too; class instances, dates
  and maps are values.
- Made while a component sets up, it belongs to that component's slot and
  lasts across Live Patches, as `signal()` does (the compiler names it).

## Inherited values

A component provides a value and every component below it inherits it,
without it being passed through the components between, as a CSS property
is inherited:

```tsx
import { Pressable, Text, VStack, inherit, inherited, provide, signal } from 'kuito';

export const Accent = inherited('#8bc6ff'); // what a reader gets with no provider above

function Badge() {
  const accent = inherit(Accent); // a signal: its JSX follows it

  return <Text color={accent.value}>New</Text>;
}

export function Screen() {
  const accent = signal('#ffb86b');

  provide(Accent, accent); // for Screen's descendants, however deep

  return (
    <VStack>
      <Badge />
      <Pressable label="Recolor" onPress={() => (accent.value = '#ff79c6')} />
    </VStack>
  );
}
```

- `inherited(fallback)` makes the key, once, as a `const` at the top of a
  module. The compiler names it after its file and variable, so a Live
  Patch evaluates it again and gets the same key back. A key made anywhere
  else (inside a function, in an object, in a package) is a new key each
  time its code runs.
- `provide(key, value)`, while a component sets up, provides `value` to its
  descendants: the components it renders and the children it is given. The
  nearest provider above a reader wins; a component's own `provide()` is not
  what it inherits itself.
- `inherit(key)`, while a component sets up, returns a read-only signal of
  the nearest provider's value, or of the fallback.

Readers stay fine-grained. A signal or a `computed` provided is the signal
the reader gets: a write reaches only the bindings that read it, and no
component runs again. A plain value is the value the provider set up with.
A reader resolves its provider while it sets up, and runs again when what
its place inherits changes: a provider above it that runs again with
another value, or starts or stops providing. To follow a prop without
that, provide a `computed` of it: `provide(Mode, computed(() => props.mode))`.

What a place inherits travels with it: a branch a `Show` re-plans alone, a
`For` row and a `List` row inherit what the place they render in inherits.
A list row resolves it when the list binds the row, so a provider above a
`List` that starts or stops providing reaches its rows as they are bound
again. `provide()` and `inherit()` anywhere but a component setting up
throw.

A motion value provided is inherited as it is, not as a signal of its
value: read which one once while setting up, and the props that read its
`.value` bind on the UI thread ([Placement](placement.md#inherited-values)).

## Granular refresh and expression identity

Kuito distinguishes **signal updates** from **source patches**.

- Signal updates modify dependent native properties without rerunning components.
- A source patch currently reconstructs the component descriptor tree in order
  to discover structural edits. That is not yet fine-grained at component level.
- During a source patch, compiler-tagged JSX expression values are retained
  when the expression hash, enclosing static text and stable view ID agree.
  The old native value is reused; a new closure receives subsequent signal changes.
- Expressions whose source changes are evaluated again. This specifically
  prevents <Text>Hey{Math.random()}</Text> from changing merely because a
  separate Button label was edited.
- A re-render (a structural signal re-plans the module) evaluates a re-run
  component's expressions again: the same source runs with other props. A
  component that did not re-run returns its previous tree, and a prop or a
  label whose thunk is the same object keeps its value and the signals it
  read, unevaluated, in every plan. Subscriptions last across plans: a kept
  binding keeps them, and a binding evaluated again subscribes only to the
  signals it newly reads and lets go of the ones it stopped reading. An
  object prop rebuilt to equal data (a style, the gestures) is not sent
  again: the kernel keeps the JSON each view's object props were last sent
  as.

This is a **targeted mitigation, not pure fine-grained source invalidation**:
component functions still execute while preparing a patch, and code in
component bodies can have side effects. Changes to non-reactive closed-over
values, inputs of parent components, lexical closures, and dynamically changing
dependencies may not be reflected if the expression text is unchanged.
Future work: compiler-generated component dependency graphs, full per-instance
prop invalidation, reactive dynamic dependency retracking, and safe subtree
reconstruction. Avoid relying on impure render expressions for app correctness.

## Hook identity

A hook's state belongs to its slot, and a slot's key is
`<component path>:<kind>:<name>`, never its position among the calls. The
compiler passes every hook its name as a last argument:

- a hook assigned to a variable is named after it: `const visits = signal(1)`
  becomes `signal(1, "visits")`, and `store`, `motion`, `ref`, `task` and `resource`
  likewise;
- a hook assigned to nothing (`onMount`, `onCleanup`, `effect`, `watch`, or a
  bare `signal(0)`) is named by its ordinal among the hooks of its kind in its
  function, in source order: `effect(fn, "#2")`;
- a name claimed twice in one render (a helper calling `signal()` twice for the
  same variable) takes `name#2`, `name#3`, in call order. Code the compiler did
  not see is named by call order the same way.

`task` and `resource` share one kind, so their names must differ from each
other; every other kind has its own names.

So adding a hook, reordering hooks or calling one inside an `if` keeps every
other hook's state: Live Patch keeps the slots whose keys survive, starts new
ones from their initial values and disposes removed ones (a removed `effect`
or `onMount` runs its cleanup, a removed `motion` value is freed on both
threads), and a warning on the device names the hooks that came and went. A
hook inside an `if` holds its slot only while the branch runs: when the
condition turns false its state is released, and it starts over when the
condition turns true again. Renaming a variable renames its slot, which
starts over.

A slot's state lasts as long as its component instance: an instance that
leaves the tree releases every slot it held, and an instance that comes back
starts from initial values. An instance is its place, its component and its
`key` (`incremental.md`): rendering another component or key in the same place
is a new instance, even inside an expression like `{flag ? <A /> : <B />}`.

## Component props

A component reads its props as values, as in React: `props.show.name`. Behind
each prop the compiler passes the attribute's expression, and the kernel
exposes it as a getter, as Solid does. So where a prop is read decides what
updates:

- Read inside JSX (`<Text>{props.count}</Text>`), it stays reactive: the text
  follows the signal behind the prop.
- Read in the component body or destructured
  (`function Label({ count })`), it is read once, when the component renders.

Read props where they are used when they should follow a signal.

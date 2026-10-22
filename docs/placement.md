# Placement

Kuito runs app code on two threads. The UI thread is the default for
anything whose inputs and outputs live there: motion values, gestures,
animations, and the props and handlers that read and move them. It runs next
to the views, so they change in the frame the touch or the animation asks for.
The JS thread is for what needs the rest of JavaScript: the network, storage,
rendering JSX, and arbitrary code.

App code never names a thread. There is no `'worklet'` directive, `runOnUI` or
`runOnJS`: the compiler and the kernel place code, and `kuito dev` reports
where it went.

## What runs where

- **The compiler** (`src/dev/threads`) compiles every function, JSX prop
  expression, event handler, `on*` callback and motion value `map` function it
  can prove safe for the UI thread a second time, into a UI bundle. "Safe"
  means that its free variables are only read, written through `.value`, or
  called. Variables are captured by member path, so `props.dim` crosses without
  the rest of `props`, and `.value` stays live.
- **The kernel** (`src/runtime/threads.ts`) places each prop and handler when
  it commits:
  - A prop whose expression reads a motion value, or is a motion value or a
    derived one, is bound on the UI thread. It updates in the same frame as the
    value it reads. A signal it also reads re-sends it from the JS thread when
    the signal changes. A Text's or Button's children that read one are
    joined there into its label the same way.
  - Gestures, their followers and their releases run on the UI thread as data;
    a gesture callback runs there when the compiler could place it.
  - An event handler that captures a motion value, or a UI-thread function
    that does (a component's handler calling the one it was given), runs on
    the UI thread, straight from the native event, and the props it moves
    update before the frame. A scroll handler there gets every frame's scroll
    event unless the app sets its own `scrollInterval`. A Pressable's own
    press runs there; a press bubbling to it from a Pressable inside it comes
    through the JS thread, which sends it on.
  - A TextField's `format` runs on the UI thread whenever the compiler
    compiled it and what it captures can cross, whatever runs its
    `onChange`: it answers the field's edit before the frame
    ([keyboard](keyboard.md#formatting)). One that cannot runs on the JS
    thread, a frame late, and the report names it as a fallback.
  - Everything else runs on the JS thread.

Inside UI-thread code, calls to JS-thread functions whose result is unused, such
as logging or analytics, are sent to the JS thread and run there. Writes to a
signal go back the same way and re-render as usual. Reads of a signal see its
value from when the code was sent. Each of these is a round trip, a
`__kuito.ui` message, counted in `__kuito.stats().total.uiMessages`.

What crosses lives as long as the code that sent it. A JS-thread function or a
signal the UI thread can reach is held by the committed plan of each module
that encoded it, and freed once none does; a call or write that arrives for one
a later patch freed is dropped. Each UI bundle a Live Patch loads replaces the
previous bundle's functions. A UI function's id comes from its file and what it
does, not from where it is: a patch that moves, reformats or comments a
function, or edits another one, keeps its id, and what the UI thread bound to
it stays bound.

## Time on the UI thread

UI-thread code runs on the main thread, so the time it takes comes out of the
frame being drawn. A development build times it: a frame whose UI-thread code
runs past 4 ms, a share of a 120 Hz frame the batches and layout leave free,
shows a warning in the LogBox naming the prop, handler, gesture callback or
`map` that took the most of it and where it is in your source:

```
A frame ran 6.2 ms of UI-thread code, over its 4 ms budget; 5.8 ms of it in 3.scroll at src/Feed.tsx:12:24. Code that runs every frame has to stay quick.
```

Every call in one frame counts: two scroll events of 3 ms each are a 6 ms
frame, and a `map` a prop reads is timed apart from the prop. Only your code
counts, wherever it runs, a binding's first run at mount included: Kuito's
own work on the UI thread, like applying the operations that mount a screen,
is not yours to make quicker and is left out. The warning's stack is the
place of the code it names, so the LogBox shows that line as its code frame.
Each place in your source is reported once, however many views run it, and
again after a Live Patch. Release builds time nothing.

A change settles in one round per link of a chain of motion values following
each other, plus one for the props that read the last. Values that follow each
other in a cycle (`x` follows `y`, which follows `x`) would move each other
forever: after 8 rounds the cycle is reported as an error and those values stop
following. A chain of more than 7 followers is cut the same way where it got
to. Props that read them stay bound.

## Signals on the UI thread

A component whose signals are read only in props the kernel binds and in
handlers, and whose handlers create no JSX, is placed whole: each of its
signals lives in the UI runtime as a motion value does, and the JS thread
reads a mirror. A Pressable toggling its opacity never crosses a thread:

```tsx
import { Pressable, signal } from 'kuito';

export function Like() {
  const liked = signal(false);

  return (
    <Pressable
      label="Like"
      opacity={liked.value ? 1 : 0.6}
      onPress={() => (liked.value = !liked.value)}
    />
  );
}
```

The compiler places a component's signals when:

- each is made from a literal at the top of the component: `signal(0)`,
  `signal('')`, `signal({ x: 0 })`;
- each is only read or written through `.value`, in a prop of a view (not
  `class`, `style`, `key`, `ref`, `id` or the motion props), in a Text's or
  Button's children, in a handler or in a gesture's or animation's callback,
  or in a local function only those handlers use (`onPress={spin}`, or
  `() => spin()` in one);
- those handlers read no JS-thread value besides (a store's signal,
  `props.selected.value`), which the UI thread would see as it was when the
  handler was sent;
- the compiler compiled every one of those functions for the UI thread.

A `computed` at the top of the component moves with its signals when its
function reads only `.value` of the component's placed signals, of motion
values and of other such computeds, and is pure: it writes no `.value` and
calls nothing for its effect. Its reads follow a signal's rules (a bound prop,
a label's children, a handler, another such computed). It becomes a value
derived from what it reads, as a motion value's `map` is: the UI thread
computes it whenever code there reads it, and the JS thread computes it from
the mirrors. It is not cached: each read runs its function again, so keep it
as quick as a `map`, and read a costly one once per prop. A computed of motion
values alone moves the same way.

```tsx
import { Pressable, Text, computed, signal } from 'kuito';

export function Counter() {
  const count = signal(1);
  const doubled = computed(() => count.value * 2);

  return (
    <Pressable label="Add" opacity={doubled.value / 10} onPress={() => count.value++}>
      <Text>{doubled.value} doubled</Text>
    </Pressable>
  );
}
```

A computed that reads no placed signal or motion value belongs to the JS
thread and stays a computed. One that reads such a value and also something
only the JS thread has (`props.step.value`, a store's signal, a computed that
stays there) cannot take a snapshot as a handler does: it would never move
again. It keeps its component on the JS thread, and the report names it where
it is, as a fallback. So does one that writes a `.value`, calls something for
its effect, or that the compiler could not compile:

```
counter.tsx:6:23  computed total runs on the JS thread: it reads props.step.value, which only the JS thread has
```

A signal read anywhere else, in a child that renders JSX, a prop of a
component, an `effect`, or passed whole (`value={text}`), keeps its component
on the JS thread, where that code runs anyway, and the report leaves it out. A
component held back only by a function the compiler rejected is a fallback:

```
toggle.tsx:4:1  component Toggle runs on the JS thread: it has signal on read by Pressable onPress, which constructs Ripple
```

A placed signal keeps its value across Live Patches, as a motion value does;
one that moves between threads in a patch starts again from its first value.

## Inherited values

What `inherit()` returns is a JS-thread signal ([Reactivity](reactivity.md#inherited-values)),
read on the UI thread as any JS-thread signal is: a snapshot. It is never
placed, and it never moves a component off the UI thread by being read in a
prop:

- A prop of a placed component that reads an inherited signal is bound
  there and re-sent from the JS thread when the signal changes, a frame
  late, as one reading a store's signal is. The component stays placed.
- A handler that reads one keeps its component on the JS thread, where the
  value is current, as any JS-thread value read in a handler does.
- A `computed` that reads one runs on the JS thread, and the report says
  so, as for any value only the JS thread has.
- A component that provides one of its signals passes it whole, so it stays
  on the JS thread.

For a value that has to move with the frame, provide a motion value. It is
inherited as it is, so a descendant binds it on the UI thread with no
handler and no round trip:

```tsx
import { Box, inherit, inherited, type Motion } from 'kuito';

const Scrolled = inherited<Motion<number> | null>(null);

export function Header() {
  const scrolled = inherit(Scrolled).value; // which motion value: read once

  return <Box opacity={scrolled ? 1 - scrolled.value / 200 : 1} />;
}
```

## The placement report

`kuito dev` prints, for each file, the components placed whole, the code that
reads or moves a motion value or a placed signal, and the callbacks the UI
thread calls (a gesture's, an animation's, a `map`'s), and where each runs. It prints every file after the first build, and a file
again whenever its placement changes:

```
◇ Placement  9 on the UI thread · 1 on the JS thread
    gestures.tsx  ui: Box translateX, Box translateY, Box rotate, tap onEnd
    gestures.tsx:66:16  Box width runs on the JS thread: it constructs Thing
```

Each line names the component (`component Like`), a computed placed with it
(`computed doubled`), the element and prop
(`Box translateX`, `Text children`), the handler (`Pressable onPress`), the
callback by the builder that takes it (`tap onEnd`, `x.map`), or the module
function. A fallback has its file, line
and column and the reason, phrased to follow "it". Code that touches no
motion value and is not called by the UI thread is not listed: it belongs on
the JS thread.

With `strict: true` in `kuito.config.ts`, a fallback is a build error with
the same lines, so code meant for the UI thread cannot quietly move to the JS
thread. A fallback only the running app can see, a capture that cannot cross,
or a `map` of a function the compiler never compiled (one from a package),
is still logged once on the device:

```
Box scale reads a motion value but runs on the JS thread, a frame late: it captures cache, which cannot cross threads (…)
```

## When it has to stay on the JS thread

A prop that reads a motion value but cannot run on the UI thread still works.
It runs on the JS thread, a frame late, following the value. The UI thread
cannot run code that:

- uses `this`, `arguments`, `await` or `yield`;
- creates JSX or a class instance (built-ins like `Date` and `Map` are fine);
- assigns a variable or object of the JS thread (`.value` is fine);
- uses the result of a JS-thread function, which the compiler knows for any
  function imported from a package (`clamp(x)` from `lodash-es`); calling one
  for its effect is fine;
- reads `typeof` a name nothing in the module declares (`typeof document`);
- captures a value that cannot cross threads, such as a class instance;
- uses the result of a method of an object it captures when that method is a
  JS-thread function (`player.seek(t).catch(…)`): on the UI thread the call
  would go to the JS thread and come back with nothing;
- captures a value computed from a motion value through a getter, such as a
  component's prop (`props.label` built from one): it would cross as it is
  now and never move.

The last three only the running app can see; the device logs each once.
Functions that call each other cross as they are: the UI thread makes the
outer one and the inner one calls it.

A `map` whose function the compiler could not place makes the prop stay on the
JS thread the same way. Captures keep `?.`: `theme.colors?.dim` reads
`undefined` when `colors` is absent, as the function would.

# Placement report

The compiler runs code that moves views (props reading motion values, gesture callbacks, handlers that move them) on the UI thread, next to the views, and the placement report in `kuito dev` says where each piece went and why.

**Use it for**

- Checking that a gesture, a scroll effect or an animation runs on the UI thread.
- Finding the line that keeps code on the JavaScript thread, a frame late, and why.
- Finding the UI-thread code that makes a frame slow.

App code never names a thread: there is no `'worklet'` directive, no `runOnUI` and no `runOnJS`.

## Read the report

`kuito dev` prints every file after the first build, and a file again whenever its placement changes:

```text
◇ Placement  9 on the UI thread · 1 on the JS thread
    gestures.tsx  ui: Box translateX, Box translateY, Box rotate, tap onEnd
    gestures.tsx:66:16  Box width runs on the JS thread: it constructs Thing
```

- The first line counts what runs on each thread.
- A `ui:` line lists, per file, what runs on the UI thread: a component placed whole (`component Like`), an element and its prop (`Box translateX`), a handler (`Pressable onPress`), a callback by the builder that takes it (`tap onEnd`, `x.map`).
- A fallback has its file, line and column, and the reason. It still works, on the JavaScript thread, a frame behind the value it follows.

Code that touches no motion value is not listed: it belongs on the JavaScript thread.

## Keep code on the UI thread

A prop, handler or callback runs on the UI thread when the compiler can prove it safe there. It stays on the JavaScript thread when it:

- uses `this`, `arguments`, `await` or `yield`;
- creates JSX or a class instance (`Date` and `Map` are fine);
- assigns a variable of the JavaScript thread (writing `.value` is fine);
- uses the result of a function from a package, such as `clamp` from `lodash-es` (calling one for its effect is fine);
- captures a value that cannot cross threads, such as a class instance.

```tsx
import { Box, motion, pan, spring } from 'kuito';

export function Slider() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  // Runs on the UI thread: it reads x and does arithmetic.
  return <Box gestures={[drag]} translateX={x} width={x.map((v) => 40 + Math.abs(v) / 4)} />;
}
```

Moving the width computation into a helper imported from a package would put that prop on the JavaScript thread, and the report would name its line.

## Make fallbacks a build error

With `strict: true` in `kuito.config.ts`, a fallback fails the build with the same lines, so code meant for the UI thread cannot quietly move.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  strict: true,
} satisfies KuitoConfig;
```

A fallback only the running app can see (a captured class instance, a `map` of a package's function) is logged once on the device instead.

## Find a slow UI-thread frame

UI-thread code runs on the main thread, so its time comes out of the frame being drawn. A development build times it. A frame whose code runs past 4 ms shows a warning in the LogBox, naming the prop, handler or callback that took the most and where it is in your source:

```text
A frame ran 6.2 ms of UI-thread code, over its 4 ms budget; 5.8 ms of it in 3.scroll at src/Feed.tsx:12:24. Code that runs every frame has to stay quick.
```

- Every call in the frame counts: two scroll events of 3 ms each make a 6 ms frame.
- Only your code counts; Kuito's own work, such as mounting a screen, is left out.
- Each place is reported once, and again after a Live Patch. Release builds time nothing.

## Related

- [Motion](./motion.md): what moves on the UI thread
- [Devtools](./devtools.md): the performance monitor's UI work time
- [Placement in depth](../../../../docs/placement.md): signals placed on the UI thread, inherited values, every fallback rule

# Keep animation work on the UI thread

Kuito places motion-dependent props and gesture callbacks on the UI thread when it can prove they are safe there. Use the placement report to check a drag, scroll effect or animation that stutters or lags behind input.

## Read the report

`kuito dev` prints placement after the first build and when a file's placement changes:

```text
◇ Placement  9 on the UI thread · 1 on the JS thread
    gestures.tsx  ui: Box translateX, Box translateY, Box rotate, tap onEnd
    gestures.tsx:66:16  Box width runs on the JS thread: it constructs Thing
```

A `ui:` entry identifies code running beside native views. A fallback includes its location and the reason it remains on the JavaScript thread. Ordinary code without motion dependencies is not listed.

## Keep frame callbacks small

```tsx
import { Box, motion, pan, spring } from 'kuito';

export function Slider() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  // Runs on the UI thread: it reads x and does arithmetic.
  return <Box gestures={[drag]} translateX={x} width={x.map((v) => 40 + Math.abs(v) / 4)} />;
}
```

The width calculation reads a motion value and performs simple arithmetic. It can run with the gesture. Avoid `await`, `yield`, JSX creation, unsupported class instances, assignments to JavaScript-thread variables, or package calls whose returned value is needed by the calculation. Writes to signals through `.value` are supported. The report explains the particular expression that prevented placement.

A callback running on the main thread shares the frame budget with layout and drawing. Development builds warn when your UI-thread code exceeds 4 ms in a frame and identify its most expensive location. Move expensive data preparation outside frame callbacks.

## Fail builds on a fallback

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  strict: true,
} satisfies KuitoConfig;
```

Use `strict` when UI placement is part of your interaction's requirements. Compiler-detectable fallbacks become build errors. Runtime-only fallbacks, such as a captured value the compiler could not classify, still report on the device.

Continue with [motion and gestures](motion.md) or [measure interaction cost](performance.md).

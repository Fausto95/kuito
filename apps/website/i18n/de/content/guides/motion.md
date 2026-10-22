# Motion

Alles, was sich bewegt, ist eine kleine Algebra, als Daten geschrieben: Quellen (ein Motion-Wert, eine Geste, ein Signal, Zeit), Transformationen (`map`, `clamp`, `interpolate`; `timing`, `spring`, `decay`; `delay`, `sequence`, `parallel`, `stagger`, `repeat`, `keyframes`) und Senken (Props). Deklarationen kompilieren zu Programmen, die der UI-Thread neben den Views ausführt, sodass Bewegung nie auf JavaScript wartet und nie eine Komponente neu rendert.

```tsx
import { Box, interpolate, motion, pan, spring } from 'kuito';

export function Card() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  return (
    <Box
      translateX={x}
      opacity={interpolate(x, [0, 200], [1, 0.5])}
      rotate={x.map((v) => v / 20)}
      gestures={[drag]}
    />
  );
}
```

Ein vollständiges Draggable, das mit der Geschwindigkeit des Fingers nach Hause federt: kein Handler, und nichts gelangt zum JavaScript-Thread, während es sich bewegt.

## Motion-Werte

`motion(initial)` funktioniert wie `signal()`: aufrufen, während eine Komponente aufsetzt, `.value` überall lesen und schreiben. `signal()` für Werte, auf die Komponenten reagieren, und `motion()` für Werte, mit denen sich der Bildschirm bewegt.

- `x.follows(source)` bewegt `x` mit `source` auf dem UI-Thread: das Feld einer Geste, ein anderer Motion-Wert oder ein abgeleiteter. `null` stoppt es.
- `x.map(fn)`, `interpolate(x, input, output)` und `clamp(x, min, max)` erstellen abgeleitete Werte, auf dem UI-Thread berechnet, wann immer sich `x` bewegt.
- `x.value = animation` animiert ihn; `x.value = 5` bewegt ihn sofort.

## Gesten

Gesten sind Werte, nativ erkannt und mit einer Prop angehängt. `pan()` bewegt `x`, `y` (seine Translation, addiert); `touches()` bewegt `x`, `y` (wo der Finger ist); `pinch()` bewegt `scale`, multiplizierend; `rotate()` bewegt `rotation` in Grad. Jede Geste nimmt die Callbacks, die JavaScript brauchen: `onStart`, `onChange` und `onEnd(event, success)`.

`gesture.release(animation)` sagt, wie ihre Follower loslassen, mit der Geschwindigkeit der Geste: `drag.release(spring())` federt nach Hause, `drag.release(decay({ clamp: [0, 400] }))` rollt aus, `drag.release(spring().to([0, 400]))` rastet am nächsten Punkt ein. Mehrere Gesten auf einer View konkurrieren; `race(a, b)`, `together(a, b)` und `orElse(a, b)` komponieren sie als Werte und lassen sich verschachteln.

## Animationen

Builder beschreiben, wie sich ein Wert bewegt; `.to(target)` sagt wohin:

```tsx
<Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />;

offset.value = sequence(timing(120).to(1.2), spring().to(1));
offset.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600));
```

`timing` läuft standardmäßig 300 ms mit `easing.inOut`; `spring` hat standardmäßig damping 10, stiffness 100, mass 1; `repeat` count Infinity.

Eine Animation startet im nächsten Frame, von wo der Wert dann ist. Einen Wert oder eine andere Animation zuzuweisen unterbricht sie, und ihr `onEnd` läuft mit `false`. Zahlen und Hex-Farben animieren; mehrere Ziele sind Rastpunkte.

## Animierte Props: `animate` und `transition`

```tsx
<Box
  animate={{ opacity: open.value ? 1 : 0.6, scale: open.value ? 1 : 0.96 }}
  transition={{ opacity: timing(200), transform: spring({ damping: 14 }) }}
/>
```

`animate` nimmt Werte für animierbare Props (`opacity`, `backgroundColor`, die Translationen, Skalierungen und `rotate`). Seine ersten Werte gelten sofort; jede Änderung danach bewegt sich, wie `transition` es sagt. `transition` benennt eine Animation pro Gruppe: `opacity`, `backgroundColor`, `transform` oder `all`. Ohne eine federn Transformationen und der Rest läuft 300-ms-Timings. Eine CSS-`transition` kompiliert zur selben Prop.

## Eintreten, Verlassen und Bewegen: `enter`, `exit`, `layout`

Ein Effekt benennt die Props, aus denen eine View eintritt und in die sie verschwindet: `fade`, `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` (`d` ist standardmäßig 24), `zoom(scale)` (standardmäßig 0.85) und `keyframes`.

```tsx
<Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />
```

`a.and(b)` und `parallel(a, b, ...)` spielen Effekte gleichzeitig; `sequence` nacheinander; `stagger(ms, a, b, ...)` jeden `ms` nach dem vorigen. `enter` spielt, wenn die View erstellt wird. Eine entfernte View mit `exit` verlässt JavaScripts Baum sofort, bleibt aber auf dem Bildschirm und nimmt keine Berührungen an, während sie hinausanimiert. `layout={spring()}` (oder `timing(...)`) animiert die View zu jedem neuen Frame, den ihr das Layout gibt.

Mit aktivierter Einstellung des Nutzers für reduzierte Bewegung springt jede Animation, Transition und jeder Effekt dorthin, wo sie enden. Gesten folgen weiterhin dem Finger.

## Vertiefung

[Motion](../../../../docs/motion.md) behandelt jede Gesten- und Animationsoption, wie Compiler und Kernel Code auf dem UI-Thread platzieren, Plattformgrenzen und den nativen Vertrag.

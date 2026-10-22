# Motion

Alles, was sich bewegt, ist eine kleine Algebra, als Daten geschrieben:

- **Quellen**: ein Motion-Wert, eine Geste, ein Signal, Zeit (eine Animation).
- **Transformationen**: `map`, `clamp`, `interpolate`; `timing`, `spring`, `decay`;
  `delay`, `sequence`, `parallel`, `stagger`, `repeat`, `keyframes`.
- **Senken**: Props.

Deklarationen kompilieren zu Programmen, die der UI-Thread neben den Views
ausführt, sodass Bewegung nie auf JavaScript wartet und nie eine Komponente neu
rendert. Ein Callback ist die Ausnahme, für das, was JavaScript braucht.

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

Das ist ein vollständiges ziehbares Element, das mit der Geschwindigkeit des
Fingers an seinen Ausgangspunkt zurückfedert: kein Handler, und nichts wechselt
zum JavaScript-Thread, während es sich bewegt.

## Motion-Werte

`motion(initial)` funktioniert wie `signal()`: beim Aufsetzen einer Komponente
aufrufen, `.value` überall lesen und schreiben. `signal()` ist für Werte, auf die
Komponenten reagieren, und `motion()` für Werte, mit denen sich der Bildschirm
bewegt. Ein Motion-Wert verschwindet, wenn seine Komponente unmountet.

- `x.follows(source)` bewegt `x` mit `source` auf dem UI-Thread: ein Feld einer
  Geste (`drag.x`), ein anderer Motion-Wert oder ein abgeleiteter. `null`
  beendet es.
- `x.map(fn)`, `interpolate(x, input, output)` und `clamp(x, min, max)` erzeugen
  abgeleitete Werte: auf dem UI-Thread berechnet, wann immer sich `x` bewegt,
  und an eine Prop übergeben oder wie ein Motion-Wert verfolgt. `interpolate`
  bildet stückweise zwischen Zahlen oder Hex-Farben ab und hält seine Endwerte,
  sofern nicht `{ extrapolate: 'extend' }` gesetzt ist. `map` nimmt eine
  Funktion entgegen, die der Compiler für den UI-Thread kompiliert hat (siehe
  [Ein Thread wird nie gewählt](placement.md)).
- `x.value = animation` animiert ihn; `x.value = 5` bewegt ihn sofort.

## Gesten

Gesten sind Werte, nativ erkannt von Ports der Recognizer von
[React Native Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler)
(RNGH), und werden mit einer einzigen Prop angehängt:

| Geste         | Optionen                                                        | Bewegt (diesen folgen)                  |
| ------------- | --------------------------------------------------------------- | --------------------------------------- |
| `pan()`       | `axis`, `minDistance`                                           | `x`, `y`: seine Verschiebung, addiert   |
| `touches()`   |                                                                 | `x`, `y`: wo der Finger in der View ist |
| `pinch()`     |                                                                 | `scale`, multiplizierend                |
| `rotate()`    |                                                                 | `rotation` in Grad, addiert             |
| `tap()`       | `count`, `maxDuration`, `maxDistance`                           |                                         |
| `longPress()` | `after` (500 ms), `maxDistance`                                 |                                         |
| `fling()`     | `direction`: `'left'`, … oder eine Liste (standardmäßig rechts) |                                         |

Jede Geste nimmt außerdem `disabled` und `hitArea` entgegen, die Namen der
View-Props (gesendet als RNGHs `enabled` und `hitSlop`, siehe [den nativen
Vertrag](#native-contract)), bewegt `active` (1, solange sie aktiv ist) und nimmt
die Callbacks entgegen, die JavaScript brauchen: `onStart` (sie wurde
aktiviert), `onChange` (sie hat sich bewegt, mit `changeX`/`changeY`,
`scaleChange` oder `rotationChange`) und `onEnd(event, success)`. Jeder läuft
dort, wo der Compiler ihn platzieren kann. `axis` lässt ein Pan nach 10 Punkten
entlang der Achse starten und nach 10 Punkten quer dazu fehlschlagen. Eine
ungültige Option ist ein Fehler.

- **Folgen**: Ein Motion-Wert, der einem Feld folgt, startet von dort, wo er
  ist, wenn die Geste aktiviert wird; `pan` und `rotate` addieren ihre
  Verschiebung oder Rotation, `pinch` multipliziert mit seiner Skalierung,
  `touches` setzt die Position.
- **Loslassen**: `gesture.release(animation)` sagt, wie ihre Follower loslassen.
  Jeder führt die Animation mit der Geschwindigkeit der Geste aus, in Richtung
  seines eigenen Ausgangspunkts (seines ersten Werts), sofern die Animation kein
  Ziel hat: `drag.release(spring())` federt zum Ausgangspunkt zurück,
  `drag.release(decay({ clamp: [0, 400] }))` rollt aus,
  `drag.release(spring().to([0, 400]))` rastet an dem Punkt ein, der dem
  Landepunkt des Wurfs am nächsten liegt.
- **Komponieren**: Mehrere Gesten auf einer View treten gegeneinander an (die
  erste, die aktiviert wird, gewinnt). `race(a, b)`, `together(a, b)` (beide
  gleichzeitig: Pinch und Rotate) und `orElse(a, b)` (b wartet darauf, dass a
  fehlschlägt: ein Doppeltipp, oder sonst ein Tipp) komponieren sie als Werte
  und lassen sich verschachteln. (Nicht `then`: ein Modul, das `then`
  exportiert, ist ein Thenable, das `import()` aufruft.) Über Views hinweg
  erhält die Geste der innersten View die Berührung zuerst, wie in RNGH.

```tsx
const zoom = pinch().release(spring());
const turn = rotate().release(spring());
const scale = motion(1).follows(zoom.scale);
const angle = motion(0).follows(turn.rotation);

<Image scale={clamp(scale, 1, 3)} rotate={angle} gestures={[together(zoom, turn)]} />;

<Box
  gestures={[
    race(
      orElse(tap({ count: 2, onEnd: like }), tap({ onEnd: open })),
      longPress({ onStart: showMenu }),
    ),
  ]}
/>;
```

Pull-to-Refresh gehört der Scroll-View selbst: `<Scroll refreshing={loading}
onRefresh={reload}>`, deren Ziehen die Plattform ausführt; `reload` ist die
Datenarbeit, die JavaScript braucht.

## Animationen

Builder beschreiben, wie sich ein Wert bewegt; `.to(target)` sagt wohin, für
eine Prop oder einen Motion-Wert, dem die Animation direkt übergeben wird:

```tsx
<Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />;

offset.value = sequence(timing(120).to(1.2), spring().to(1));
offset.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600));
```

| Builder                                                                 | Standardwerte                               |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| `timing(duration)`, `timing({ duration, easing, delay, onEnd })`        | 300 ms, `easing.inOut`                      |
| `spring({ damping, stiffness, mass, velocity, delay, onEnd })`          | damping 10, stiffness 100, mass 1           |
| `spring({ duration, dampingRatio, clamp, ... })`                        | 1333 ms, Dämpfungsverhältnis 0.5            |
| `decay({ velocity, deceleration, clamp, rubberBand, onEnd })`           | velocity 0, deceleration 0.998              |
| `keyframes({ 0: a, 50: b, 100: c }, duration or timing config)`         | ein Timing durch jeden Stopp                |
| `delay(ms, animation)`                                                  | fügt jeder Animation eine Verzögerung hinzu |
| `sequence(a, b, ...)`, `repeat(animation, { count, reverse, onEnd })`   | count Infinity                              |
| `easing.linear`, `ease`, `in`, `out`, `inOut`, `bezier(x1, y1, x2, y2)` | cubic-bezier-Kurven, wie in CSS             |

Eine Animation startet im nächsten Frame, von dort, wo der Wert dann ist. Das
Zuweisen eines Werts oder einer anderen Animation unterbricht sie, und ihr
`onEnd` läuft mit `false`. Ein Spring behält die Geschwindigkeit dessen, was er
unterbricht, wenn sie ihn auf sein Ziel zuträgt, und behält eine Geschwindigkeit,
die ihm übergeben wird (die eines Loslassens), in jedem Fall. Zahlen und
Hex-Farben (`#rrggbb`, `#rrggbbaa`) animieren; eine Farbe führt jede Animation
Kanal für Kanal aus. Mehrere Ziele sind Rastpunkte. `onEnd` braucht einen
Motion-Wert, den die App hält: eine Prop, der eines übergeben wird, ist ein
Fehler, ebenso ein Timing oder Spring ohne Ziel. Bis der UI-Thread eine
Animation startet, gibt ein Lesezugriff vom JS-Thread zurück, wo der Wert ist,
nicht wohin er geht.

Die Mathematik (Timing entlang einer kubischen Bezier-Kurve, Springs per Physik
oder per Dauer, starres und Gummiband-Decay, Sequence, Repeat und Delay) ist ein
Port von Reanimateds, mit dessen Konfigurationsnamen und Standardwerten (für
Springs die von Reanimated 3): ein Delay lässt die Animation, die es
unterbricht, weiterlaufen, bis es startet.

## Animierte Props: `animate` und `transition`

Eine View sagt, was sich ändert und wie es sich bewegt:

```tsx
<Box
  animate={{ opacity: open.value ? 1 : 0.6, scale: open.value ? 1 : 0.96 }}
  transition={{ opacity: timing(200), transform: spring({ damping: 14 }) }}
/>
```

`animate` nimmt Werte für animierbare Props entgegen (`opacity`,
`backgroundColor`, `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`,
`rotate`). Seine ersten Werte gelten sofort; jede spätere Änderung bewegt sich,
wie `transition` es sagt. Eine Prop, die sowohl direkt als auch in `animate`
gesetzt wird, ist ein Fehler, ebenso eine Animation in `animate`.

`transition` benennt eine Animation pro Gruppe: `opacity`, `backgroundColor`,
`transform` (die Verschiebungen, Skalierungen und die Rotation) oder `all`. Sie
gilt für `animate`, für `enter` und `exit` und für einfache Änderungen der
Props, die sie benennt. Ohne eine solche federn `animate`, `enter` und `exit`
Transformationen und führen für den Rest 300-ms-Timings aus; eine einfache
Prop-Änderung gilt sofort. Eine CSS-`transition` in einem `.css`-Modul oder in
`styles()` kompiliert zu derselben Prop
([Native Styles](styles.md#transitions)):

```css
.card {
  transition:
    transform 400ms spring(14, 180),
    opacity 250ms ease-out;
}
```

Eine Prop, der eine Animation übergeben wird oder die sich unter einer
Transition ändert, bindet sich an einen eigenen Motion-Wert, sodass jede
Animation dort weitergeht, wo die letzte war.

## Eintreten, Verlassen und Bewegen: `enter`, `exit`, `layout`

Ein Effekt benennt die Props, von denen aus eine View eintritt und zu denen sie
austritt:

| Effekt                                                            | Tritt ein von, tritt aus zu                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `fade`                                                            | transparent                                                 |
| `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` | `d` (standardmäßig 24) entfernt, in diese Richtung bewegend |
| `zoom(scale)`                                                     | `scale`, standardmäßig 0.85                                 |
| `keyframes({ 0: { ... }, 100: { ... } }, duration)`               | seine eigenen Stopps, in beide Richtungen dieselben         |

```tsx
<Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />
```

`a.and(b)` und `parallel(a, b, ...)` spielen Effekte gleichzeitig ab; `sequence`
einen nach dem anderen, wobei jeder startet, wenn die langsamste Prop des
vorherigen endet; `stagger(ms, a, b, ...)` jeden `ms` nach dem vorherigen;
`delay(ms, effect)` später. Jede Prop bewegt sich, wie `transition` es sagt, und
endet beim eigenen Wert der View.

`enter` spielt, wenn die View erzeugt wird. Wird eine View mit `exit` entfernt,
verlässt sie JavaScripts Baum sofort, aber der Renderer behält sie auf dem
Bildschirm, ohne Berührungen entgegenzunehmen, während der UI-Thread sie von
dort, wo sie ist, hinausanimiert.

`layout={spring()}` (oder `timing(...)`) animiert die View zu jedem neuen
Rahmen, den das Layout ihr gibt, auf dem plattformeigenen Animator. Ihr erster
Rahmen gilt sofort.

Zwei Dinge bleiben auf den Animatoren der Plattform statt auf dem Motion-Pfad
des UI-Threads, beide auf dem Main-Thread ohne JavaScript darin. `layout` bewegt
eine View zu einem Rahmen, den der Layout-Durchlauf berechnet, während er
angewendet wird, nachdem der Frame des UI-Threads gelaufen ist; der UI-Thread
treibt Props an, nicht Rahmen, also interpoliert der Renderer den Rahmen selbst
(ein UIKit-Property-Animator; ein `ValueAnimator` oder `SpringAnimation` auf
Android). Das `pressedOpacity`- und `pressedScale`-Feedback eines Pressable
folgt der eigenen Berührungsverfolgung der nativen View, ein festes schnelles
Ease-In und sanftes Ease-Out; es durch den UI-Kernel zu schicken, würde jeder
Berührung einen Hop hinzufügen, ohne dass sich etwas an dem ändert, was der
Nutzer sieht.

Eine View mit einer `sharedId` fliegt zur View mit derselben `sharedId` auf dem
Screen, zu dem ein Stack pusht oder popt, parallel zum eigenen Übergang des
Stacks ([Geteilte Elemente](navigation.md#shared-elements)).

## Reduzierte Bewegung

Mit aktivierter Einstellung des Nutzers für reduzierte Bewegung springt jede
Animation, Transition und jeder Effekt dorthin, wo sie enden, und `layout`
wendet Rahmen sofort an (die Reduce-Motion-Einstellung des Systems auf iOS, die
Animator-Dauerskalierung auf Android). Gesten folgen weiterhin dem Finger: das
ist direkte Manipulation, keine Animation. Der Kernel teilt dem UI-Thread die
Einstellung beim Start und bei jeder Änderung mit.

## Ein Thread wird nie gewählt

Es gibt keine `'worklet'`-Direktive, kein `runOnUI` oder `runOnJS`. Der Compiler
und der Kernel entscheiden:

- **Der Compiler** (`src/dev/threads`) kompiliert jede Funktion, jeden
  JSX-Prop-Ausdruck, Event-Handler, `on*`-Callback und jede `map`-Funktion eines
  Motion-Werts, die er als sicher für den UI-Thread beweisen kann, ein zweites
  Mal, in ein UI-Bundle. "Sicher" bedeutet, dass ihre freien Variablen nur
  gelesen, über `.value` geschrieben oder aufgerufen werden. Variablen werden
  nach Member-Pfad erfasst, sodass `props.dim` ohne den Rest von `props`
  hinüberwechselt und `.value` live bleibt.
- **Der Kernel** (`src/runtime/threads.ts`) platziert jede Prop und jeden
  Handler beim Commit:
  - Eine Prop, deren Ausdruck einen Motion-Wert liest oder die ein Motion-Wert
    oder ein abgeleiteter ist, wird auf dem UI-Thread gebunden. Sie aktualisiert
    sich im selben Frame wie der Wert, den sie liest. Ein Signal, das sie
    ebenfalls liest, sendet sie vom JS-Thread erneut, wenn sich das Signal
    ändert.
  - Gesten, ihre Follower und ihre Releases laufen auf dem UI-Thread als Daten;
    ein Gesten-Callback läuft dort, wenn der Compiler ihn platzieren konnte.
  - Ein Event-Handler, der einen Motion-Wert erfasst, läuft auf dem UI-Thread,
    direkt aus dem nativen Event, und die Props, die er bewegt, aktualisieren
    sich vor dem Frame. Ein Scroll-Handler dort erhält das Scroll-Event jedes
    Frames, sofern die App kein eigenes `scrollInterval` setzt.
  - Alles andere läuft auf dem JS-Thread.

Innerhalb von UI-Thread-Code werden Aufrufe von JS-Thread-Funktionen, deren
Ergebnis ungenutzt bleibt, etwa Logging oder Analytics, an den JS-Thread
gesendet und dort ausgeführt. Schreibzugriffe auf ein Signal gehen auf demselben
Weg zurück und rendern wie üblich neu. Lesezugriffe auf ein Signal sehen seinen
Wert vom Zeitpunkt, als der Code gesendet wurde. Jedes davon ist eine
`__kuito.ui`-Nachricht, gezählt in `__kuito.stats().total.uiMessages`.

Was hinüberwechselt, lebt so lange wie der Code, der es gesendet hat. Eine
JS-Thread-Funktion oder ein Signal, das der UI-Thread erreichen kann, wird vom
committeten Plan jedes Moduls gehalten, das es kodiert hat, und freigegeben,
sobald keines es mehr tut; ein Aufruf oder Schreibzugriff, der für eines
ankommt, das ein späterer Patch freigegeben hat, wird verworfen. Jedes
UI-Bundle, das ein Live Patch lädt, ersetzt die Funktionen des vorherigen
Bundles. Die ID einer UI-Funktion ergibt sich aus ihrer Datei und dem, was sie
tut, nicht daraus, wo sie steht: ein Patch, der eine Funktion verschiebt,
umformatiert oder kommentiert oder eine andere bearbeitet, behält ihre ID, und
was der UI-Thread an sie gebunden hat, bleibt gebunden.

## Wenn es auf dem JS-Thread bleiben muss

Eine Prop, die einen Motion-Wert liest, aber nicht auf dem UI-Thread laufen
kann, funktioniert trotzdem. Sie läuft auf dem JS-Thread, einen Frame zu spät,
und Kuito protokolliert einmalig eine Warnung mit Grund und Fundstelle:

```
Box width reads a motion value but runs on the JS thread, a frame late: it constructs Thing (app.tsx:4:7)
```

Der UI-Thread kann keinen Code ausführen, der:

- `this`, `arguments`, `await` oder `yield` verwendet;
- JSX oder eine Klasseninstanz erzeugt (eingebaute wie `Date` und `Map` sind in
  Ordnung);
- einer Variablen oder einem Objekt des JS-Threads etwas zuweist (`.value` ist
  in Ordnung);
- das Ergebnis einer JS-Thread-Funktion verwendet, was der Compiler für jede aus
  einem Paket importierte Funktion weiß (`clamp(x)` aus `lodash-es`); eine wegen
  ihres Effekts aufzurufen ist in Ordnung;
- `typeof` eines Namens liest, den nichts im Modul deklariert (`typeof document`);
- einen Wert erfasst, der Threads nicht überqueren kann, etwa eine
  Klasseninstanz.

Ein `map`, dessen Funktion der Compiler nicht platzieren konnte, lässt die Prop
auf dieselbe Weise auf dem JS-Thread bleiben. Erfassungen behalten `?.`:
`theme.colors?.dim` liest `undefined`, wenn `colors` fehlt, wie es die Funktion
täte.

## Wie die Threads im Gleichschritt bleiben

- Motion-Werte gehören dem UI-Thread. Ein Lesezugriff vom JS-Thread wartet nie.
  Er gibt die Kopie zurück, die die UI-Laufzeit nach jeder Änderung schreibt, es
  sei denn, der JS-Thread hat seitdem einen neueren Wert geschrieben; dieser
  Schreibzugriff ist nummeriert, und die Kopie zeigt, wann der UI-Thread ihn
  angewendet hat. Die Kopie einer Zahl ist eine Zahl
  (`native/shared/MotionMirror.h`); die Kopien anderer Werte sind JSON.
- Operationen für den UI-Thread werden während eines JS-Tasks in eine
  Warteschlange gestellt und reisen innerhalb des nativen Mutations-Batches nach
  den View-Mutationen, auf die sie sich beziehen. Rückrufe zum JS-Thread reisen
  als `__kuito.ui`-Events (`docs/events.md`).
- Werte überqueren die Grenze als JSON mit einigen wenigen Tags
  (`src/runtime/thread-wire.ts`).
- Die UI-Laufzeit startet mit der ersten Nachricht. Eine App, die nie etwas
  bewegt, zahlt nichts, und ein Host ohne UI-Laufzeit führt alles auf dem
  JS-Thread aus: auch Gesten und ihre Follower, während eine zugewiesene
  Animation dorthin springt, wo sie endet (ein Decay bleibt, wo es ist), und
  `onEnd` mit `true` aufruft, und Effekte nichts tun.

## Plattformen

Auf iOS und Android ist die UI-Laufzeit eine zweite Hermes-Laufzeit auf dem
Main-Thread (`native/shared/UIRuntime.cpp`), neben dem Renderer. Sie wendet die
Props, die sie berechnet, vor der Rückkehr an, sodass sie im gerade aufgebauten
Frame landen. Animationen schreiten mit Display-Frames voran, denselben, die die
Batches des JS-Threads anwenden (docs/native-scheduling.md), und die UI-Laufzeit
fordert sie nur an, während etwas animiert oder Batches warten.

Gesten funktionieren auf beiden Plattformen innerhalb eines `Sheet`: auf Android
ist der Inhalt des Sheets eine eigene Berührungswurzel, da er in einem eigenen
Fenster lebt.

Grenzen:

- Android: ein vertikales `Scroll` bricht eine Geste auf einem Vorfahren nicht
  ab, wenn es zu scrollen beginnt (sein Refresh-Wrapper schluckt die Anfrage).
- Ein Tipp auf einen Vorfahren eines `Pressable` gewinnt über das Drücken, wie
  in RNGH; `Pressable`s `onLongPress` ist sein eigenes Press-Event.

## Nativer Vertrag

Strukturierte Werte überqueren die native Grenze als JSON-Strings. Eine
animierte Prop erreicht den Renderer als die Werte, die der UI-Thread in jedem
Frame setzt; der Kernel behält `transition`, `animate`, `enter` und die
`gestures`-Werte der App und sendet sie nie so, wie sie übergeben wurden.

- `exit`: `true`, solange die View einen Exit-Effekt hat. Eine entfernte View
  damit bleibt in ihrer Superview, gehalten vom Renderer, der die Props
  anwendet, die der UI-Thread auf ihr setzt, bis der UI-Thread `exited` setzt;
  dann verschwindet sie.
- `layout`: `{ type: 'timing', duration, easing: [x1, y1, x2, y2], delay }` oder
  `{ type: 'spring', damping, stiffness, mass, delay }`, die Animation, mit der
  Rahmenänderungen laufen (ein UIKit-Property-Animator; ein `ValueAnimator` oder
  `SpringAnimation` auf den Bounds der View auf Android).
- `gestures`: ein Eintrag pro Recognizer, der an die View angehängt ist (eine
  komponierte Geste steuert alle ihre Gesten bei), im Besitz von
  `properties/KuitoGestureProperties` auf beiden Renderern, die RNGHs portierte
  Recognizer in `gestures/` halten:

```json
[
  {
    "tag": 7,
    "type": "pan",
    "config": { "activeOffsetXStart": -10, "activeOffsetXEnd": 10, "minDist": 4 },
    "waitFor": [],
    "simultaneousHandlers": [8],
    "blocksHandlers": []
  }
]
```

- `type`: `pan`, `tap`, `longPress`, `pinch`, `rotation` oder `fling`.
- `config`: RNGHs native Konfigurationsschlüssel, nur die gesetzten: `enabled`,
  `shouldCancelWhenOutside`, `hitSlop` (`{ left, top, right, bottom, width,
  height, horizontal, vertical }`), Pans `activeOffsetXStart/End`,
  `activeOffsetYStart/End`, `failOffsetXStart/End`, `failOffsetYStart/End`,
  `minDist`, `minPointers`, `maxPointers`, `minVelocity`, `minVelocityX/Y`,
  `avgTouches`, `activateAfterLongPress`; Taps `numberOfTaps`,
  `maxDurationMs`, `maxDelayMs`, `maxDist`, `maxDeltaX/Y`, `minPointers`; Long
  Press' `minDurationMs`, `maxDist`, `numberOfPointers`; Flings `direction`
  (eine Bitmaske: RIGHT 1, LEFT 2, UP 4, DOWN 8) und `numberOfPointers`.
- Beziehungen benennen andere Gesten über `tag`, die in der App eindeutig sind.
- Ein neuer Wert ersetzt die Gesten der View: Recognizer, deren Tag weg ist,
  werden entfernt, andere werden neu konfiguriert. `null` entfernt sie alle.

Die View sendet `gesture`-Events (ihre Nummer, `gesture`, eine JSON-Nutzlast) mit
`handlerTag`, `state`, `numberOfPointers`, `pointerType` (0 Berührung) und den
Feldern der Geste: `x`, `y`, `absoluteX/Y`; Pans `translationX/Y` und
`velocityX/Y`; Pinchs `scale`, `focalX/Y` und `velocity`; Rotations `rotation`
(Radiant auf der Leitung, Grad für die App), `anchorX/Y` und `velocity`; Long
Press' `duration`; plus `oldState` bei einer Zustandsänderung. Eine
Zustandsänderung und ein Update sind getrennte Events: ein Update hat kein
`oldState`. Zustände sind RNGHs: UNDETERMINED 0, FAILED 1, BEGAN 2, CANCELLED 3,
ACTIVE 4, END 5. Abstände sind in Punkten (iOS) oder dichteunabhängigen Pixeln
(Android).

Der Kernel wandelt Gestenwerte in diesen Vertrag um (`src/runtime/gestures.ts`,
komponiert nach RNGHs Regeln in `src/runtime/gesture-specs.ts`), und der
Dispatcher, den beide Threads teilen (`src/runtime/gesture-events.ts`), wandelt
Events in Callbacks und Follower-Bewegungen um, die Abbildung von RNGHs
`useAnimatedGesture`.

## Danksagungen

- Das Modell von Props, die auf dem UI-Thread aus geteilten Werten berechnet
  werden, die Animationsmathematik und `interpolate` stammen aus
  [Reanimated](https://github.com/software-mansion/react-native-reanimated)
  (MIT, Software Mansion). Kuito verfolgt Abhängigkeiten pro Durchlauf, wie
  seine Signale es tun, statt über alles, was eine Funktion erfasst hat.
- Die nativen Recognizer sind Ports derer von React Native Gesture Handler, und
  die Kompositionsregeln und die Event-Abbildung folgen dessen `Gesture`-API:
  MIT License, Copyright (c) 2016 Software Mansion.
- Das Kompilieren von Thread-Funktionen in ein zweites Bundle, mit verzögert
  ausgewerteten Erfassungen, folgt dem Compiler von
  [Octane](https://github.com/octanejs/octane) (MIT, Dominic Gannaway).

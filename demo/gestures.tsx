import {
  Box,
  SafeArea,
  Text,
  VStack,
  clamp,
  decay,
  interpolate,
  longPress,
  motion,
  orElse,
  pan,
  pinch,
  race,
  rotate,
  signal,
  spring,
  tap,
  together,
  touches,
} from 'kuito';

/**
 * Gestures as values, every frame on the UI thread and none of it app code:
 * drag the card (it springs home), pinch and rotate the square together,
 * flick the slider (it coasts to its ends), touch the pad, and tap,
 * double-tap or long-press the badge. Nothing needs JavaScript: the counters
 * are this component's signals, which live on the UI thread with the
 * gestures that move them (docs/placement.md).
 */
export default function App() {
  const drag = pan().release(spring());
  const x = motion(0).follows(drag.x);
  const y = motion(0).follows(drag.y);

  const zoom = pinch().release(spring());
  const turn = rotate().release(spring());
  const scale = motion(1).follows(zoom.scale);
  const angle = motion(0).follows(turn.rotation);

  const flick = pan({ axis: 'x' }).release(decay({ clamp: [0, 200], rubberBand: true }));
  const knob = motion(0).follows(flick.x);

  const pad = touches();
  const finger = motion(0).follows(pad.x);

  const taps = signal(0);
  const doubles = signal(0);
  const holds = signal(0);
  const press = longPress({ after: 400, onStart: () => holds.value++ });
  const held = motion(0).follows(press.active);

  return (
    <SafeArea flex={1} backgroundColor="#0b0b10">
      <VStack gap={24} padding={24} alignItems="center">
        <Box
          id="card"
          width={220}
          height={120}
          borderRadius={16}
          backgroundColor="#e50914"
          translateX={x}
          translateY={y}
          rotate={x.map((value) => value / 20)}
          gestures={[drag]}
        />
        <Box
          id="square"
          width={140}
          height={140}
          borderRadius={12}
          backgroundColor="#46d369"
          scale={clamp(scale, 0.5, 3)}
          rotate={angle}
          gestures={[together(zoom, turn)]}
        />
        <Box width={240} height={44} borderRadius={22} backgroundColor="#1c1c24">
          <Box
            id="knob"
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor="#f5c518"
            translateX={knob}
            gestures={[flick]}
          />
        </Box>
        <Box
          id="pad"
          width={240}
          height={60}
          borderRadius={12}
          backgroundColor={interpolate(finger, [0, 240], ['#1c1c24', '#3a6df0'])}
          gestures={[pad]}
        />
        <Box
          id="badge"
          width={72}
          height={72}
          borderRadius={36}
          backgroundColor="#ffffff"
          scale={held.map((value) => 1 + value * 0.2)}
          gestures={[
            race(
              orElse(
                tap({ count: 2, onEnd: () => doubles.value++ }),
                tap({ onEnd: () => taps.value++ }),
              ),
              press,
            ),
          ]}
        />
        <Text id="counts" color="#d0d0dc">
          {`${taps.value} taps · ${doubles.value} double taps · ${holds.value} long presses`}
        </Text>
      </VStack>
    </SafeArea>
  );
}

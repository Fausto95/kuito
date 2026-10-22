# Gesture card stack

A stack of cards that follows a horizontal pan, springs home past its rest, and flies off when a flick wins. Keep and Pass do the same from a menu, and Share hands the pick to the share sheet.

**Use it for**

- `pan` and `fling` recognized together, with `race` so the first flick wins.
- A spring that overshoots on the way home, and one with `overshoot: false` for the flight off screen.
- A `ContextMenu` on the top card.

The whole screen is [demo/recipes/card-stack.tsx](../../../../../demo/recipes/card-stack.tsx).

## Follow the finger, then fly

The drag releases into a spring whose damping lets it pass the rest point and come back. The flight does not: overshooting would bring the card back on screen. `together` runs the pan and the flick race on the same card. Only the top card has the gestures.

```tsx
import {
  ContextMenu,
  Text,
  fling,
  motion,
  pan,
  race,
  share,
  signal,
  spring,
  together,
  watch,
  type Signal,
} from 'kuito';

const MENU = ['Share', 'Keep', 'Pass'].map((label) => ({ value: label.toLowerCase(), label }));

function Card(props: {
  title: string;
  top: boolean;
  verdict: Signal<number>;
  onGone: (direction: number) => void;
}) {
  const x = motion(0);
  const drag = pan({ axis: 'x' }).release(spring({ damping: 8, stiffness: 140 }));
  const fly = (direction: number) => {
    x.value = spring({ overshoot: false, onEnd: (done) => done && props.onGone(direction) }).to(
      direction * 600,
    );
  };
  const flick = race(
    fling({ direction: 'left', onEnd: (_, ok) => ok && fly(-1) }),
    fling({ direction: 'right', onEnd: (_, ok) => ok && fly(1) }),
  );

  x.follows(drag.x);
  watch(props.verdict, (direction) => {
    if (props.top && direction !== 0) fly(direction);
  });

  return (
    <ContextMenu
      title={props.title}
      items={MENU}
      disabled={!props.top}
      gestures={props.top ? [together(drag, flick)] : []}
      translateX={x}
      onSelect={({ value }) =>
        value === 'share'
          ? share({ message: `Watch ${props.title} tonight`, url: 'https://kuito.dev/picks/1' })
          : (props.verdict.value = value === 'keep' ? 1 : -1)
      }
    >
      <Text>{props.title}</Text>
    </ContextMenu>
  );
}

export default function CardStack() {
  const verdict = signal(0);

  return <Card title="Severance" top verdict={verdict} onGone={() => (verdict.value = 0)} />;
}
```

## Related

- [Motion](../motion.md#drag-and-let-go): pan and a spring
- [Primitives](../primitives.md): `ContextMenu`

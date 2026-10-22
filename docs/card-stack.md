# Combine a drag, flick and context menu

Use gesture composition when the same card needs a continuous drag and a directional dismissal. The example exposes the same Keep/Pass actions through a native context menu.

## Follow a drag and dismiss on a flick

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
          ? share({ message: `Watch ${props.title} tonight`, url: 'https://example.com/picks/1' })
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

`race` chooses one directional fling; `together` lets that recognition coexist with the pan. The drag springs back with overshoot, while dismissal disables overshoot so the card does not return onscreen. `onEnd` removes the card only if the animation finished.

This sample renders one card and reports completion. For a stack, keep cards in a keyed collection, attach gestures only to the top card and remove it in `onGone`. Make menu actions update the same verdict signal as gestures. See [motion](motion.md), [ContextMenu](context-menu.md) and [sharing](share.md).

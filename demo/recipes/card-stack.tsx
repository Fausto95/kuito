import {
  ContextMenu,
  For,
  HStack,
  Pressable,
  SafeArea,
  Text,
  VStack,
  fling,
  interpolate,
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

type Pick = { id: number; title: string; color: string };

const PICKS: Pick[] = [
  { id: 1, title: 'Severance', color: '#3a6df0' },
  { id: 2, title: 'The Bear', color: '#e5484d' },
  { id: 3, title: 'Slow Horses', color: '#46a758' },
  { id: 4, title: 'Shrinking', color: '#f5a524' },
];

const MENU = ['Share', 'Keep', 'Pass'].map((label) => ({ value: label.toLowerCase(), label }));

interface CardProps {
  pick: Pick;
  top: boolean;
  /** 1 to keep the top card, -1 to pass it: it flies off that way. */
  verdict: Signal<number>;
  onGone: (direction: number) => void;
}

/** A card that follows the finger, springs home past its rest, and flies off on a flick. */
function Card(props: CardProps) {
  const { pick, verdict } = props;
  const x = motion(0);
  const drag = pan({ axis: 'x' }).release(spring({ damping: 8, stiffness: 140 }));
  // A flown card goes straight off: overshooting would bring it back on screen.
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

  watch(verdict, (direction) => {
    if (props.top && direction !== 0) fly(direction);
  });

  return (
    <ContextMenu
      title={pick.title}
      items={MENU}
      disabled={!props.top}
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      onSelect={({ value }) =>
        value === 'share'
          ? share({
              message: `Watch ${pick.title} tonight`,
              url: `https://kuito.dev/picks/${pick.id}`,
            })
          : (verdict.value = value === 'keep' ? 1 : -1)
      }
    >
      <VStack
        flex={1}
        borderRadius={24}
        padding={24}
        justifyContent="flex-end"
        backgroundColor={pick.color}
        translateX={x}
        rotate={interpolate(x, [-300, 0, 300], [-12, 0, 12])}
        animate={{ scale: props.top ? 1 : 0.94 }}
        transition={{ transform: spring({ damping: 10 }) }}
        gestures={props.top ? [together(drag, flick)] : []}
      >
        <Text color="#ffffff" fontSize={32} fontWeight={700}>
          {pick.title}
        </Text>
      </VStack>
    </ContextMenu>
  );
}

/** Tonight's picks: swipe right or press Keep, swipe left or press Pass. */
export default function CardStack() {
  const index = signal(0);
  const kept = signal(0);
  const verdict = signal(0);

  const gone = (direction: number) => {
    if (direction > 0) kept.value++;
    verdict.value = 0;
    index.value++;
  };
  // The card behind first, so the top card draws over it.
  const shown = () => PICKS.slice(index.value, index.value + 2).reverse();
  const choice = (label: string, direction: number) => (
    <Pressable
      flex={1}
      padding={16}
      borderRadius={14}
      alignItems="center"
      backgroundColor="#1c1c24"
      onPress={() => (verdict.value = direction)}
    >
      <Text color="#ffffff">{label}</Text>
    </Pressable>
  );

  return (
    <SafeArea flex={1} padding={24} gap={24} backgroundColor="#0b0b10">
      <Text color="#d0d0dc">{`${kept.value} kept of ${index.value} seen`}</Text>
      <VStack flex={1}>
        <For
          each={shown()}
          fallback={
            <Pressable
              flex={1}
              justifyContent="center"
              alignItems="center"
              onPress={() => (index.value = kept.value = 0)}
            >
              <Text color="#ffffff">That’s every pick: start over</Text>
            </Pressable>
          }
        >
          {(pick) => (
            <Card pick={pick} top={pick === PICKS[index.value]} verdict={verdict} onGone={gone} />
          )}
        </For>
      </VStack>
      <HStack gap={16}>
        {choice('Pass', -1)}
        {choice('Keep', 1)}
      </HStack>
    </SafeArea>
  );
}
